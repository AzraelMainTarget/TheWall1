"""
Ragnell Engine — GPU-воркер на Modal. Автор: NeWerMoRe

Готов к запуску, но ТРЕБУЕТ твоего аккаунта Modal (бесплатные $30/мес, карта не нужна).

Установка и первый запуск:
    pip install modal
    modal token new                     # откроет браузер, войдёшь сам
    modal secret create hf-token HF_TOKEN=hf_xxx
    modal deploy engine/modal_ltx.py
    # → получишь https://<user>--ragnell-ltx.modal.run, это и есть GPU_URL

Модель по умолчанию — LTX-Video 2B distilled (5.9 ГБ, тянет даже 12 ГБ карта).
Для LTX-2.5 22B NVFP4 раскомментируй блок LTX2 в load_model().
"""

import os
import tempfile

import modal

APP_NAME = "ragnell-ltx"
MODEL_ID = os.environ.get("LTX_MODEL", "Lightricks/LTX-Video")

app = modal.App(APP_NAME)

# Образ собирается один раз, дальше стартует за секунды.
image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg", "libgl1", "libglib2.0-0")
    .pip_install(
        "torch==2.5.1",
        "diffusers>=0.32.0",
        "transformers>=4.46.0",
        "accelerate>=1.1.0",
        "sentencepiece",
        "imageio[ffmpeg]",
        "fastapi[standard]",
        "huggingface_hub",
    )
)

# Веса держим на volume — скачиваются один раз, не тратят минуты GPU.
weights = modal.Volume.from_name("ragnell-weights", create_if_missing=True)


@app.cls(
    image=image,
    gpu="L4",                       # 24 ГБ. Для 22B NVFP4 поставь gpu="L40S" или "A100-80GB"
    timeout=900,
    scaledown_window=120,           # через 2 мин простоя GPU отпускается — не тратим кредиты
    volumes={"/weights": weights},
    secrets=[modal.Secret.from_name("hf-token")],
)
class LTX:
    @modal.enter()
    def load_model(self):
        import torch
        from diffusers import LTXPipeline

        self.device = "cuda"
        self.dtype = torch.bfloat16
        os.environ["HF_HOME"] = "/weights/hf"

        self.pipe = LTXPipeline.from_pretrained(
            MODEL_ID,
            torch_dtype=self.dtype,
            cache_dir="/weights/hf",
        ).to(self.device)

        # Экономия памяти: энкодер T5 держим вне VRAM
        self.pipe.text_encoder.to("cpu")
        if hasattr(self.pipe, "enable_model_cpu_offload"):
            self.pipe.enable_model_cpu_offload()
        if hasattr(self.pipe, "vae") and hasattr(self.pipe.vae, "enable_tiling"):
            self.pipe.vae.enable_tiling()

        # --- LTX-2.5 22B NVFP4 (нужна карта 48 ГБ) ---
        # from ltx_pipelines import DistilledPipeline
        # self.pipe = DistilledPipeline.from_pretrained(
        #     "Lightricks/LTX-2.5-22b-distilled-nvfp4", device=self.device)
        print("model ready:", MODEL_ID)

    @modal.method()
    def generate(self, req: dict) -> dict:
        import base64
        import torch

        fps = int(req.get("fps", 24))
        num_frames = int(req.get("num_frames", 120))
        # LTX требует 8n+1 кадров
        num_frames = max(9, (num_frames // 8) * 8 + 1)

        width, height = int(req.get("width", 720)), int(req.get("height", 1280))
        # кратность 32
        width, height = (width // 32) * 32, (height // 32) * 32

        gen = torch.Generator(device="cpu").manual_seed(int(req.get("seed", 42)))

        out = self.pipe(
            prompt=req["prompt"],
            negative_prompt=req.get("negative") or "worst quality, blurry, jpeg artifacts",
            width=width,
            height=height,
            num_frames=num_frames,
            num_inference_steps=int(req.get("steps", 30)),
            guidance_scale=float(req.get("guidance", 3.0)),
            generator=gen,
        ).frames[0]

        with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as f:
            path = f.name
        from diffusers.utils import export_to_video
        export_to_video(out, path, fps=fps)

        with open(path, "rb") as f:
            data = f.read()
        os.unlink(path)

        return {"b64": base64.b64encode(data).decode(), "ext": "mp4", "frames": num_frames}


@app.function(image=image, timeout=60)
@modal.fastapi_endpoint(method="POST")
def generate(req: dict):
    """HTTP-точка, на которую смотрит Cloudflare Worker (env.GPU_URL)."""
    job = LTX().generate.remote(req)
    return job
