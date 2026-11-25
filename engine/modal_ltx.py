"""
Ragnell Engine — GPU-воркер на Modal. Автор: NeWerMoRe

Проверено по актуальной документации diffusers (ноябрь 2026):
  - класс пайплайна: LTX2Pipeline  (не LTXPipeline — тот был у LTX-Video 0.9)
  - репозиторий весов: Lightricks/LTX-2.5-Diffusers
  - аргумент точности: dtype= (не torch_dtype=)
  - расписание: sigmas=DISTILLED_SIGMA_VALUES (быстрый путь, 8 шагов)
  - на выходе: (video, audio) — LTX-2 умеет звук
  - сборка: encode_video(...) с audio_sample_rate из вокодера

ТВОИ ШАГИ (без карты, бесплатные $30/мес):
    pip install modal
    modal token new                       # откроет браузер, войдёшь сам
    modal secret create hf-token HF_TOKEN=hf_xxx
    modal deploy engine/modal_ltx.py

Что получишь: адрес вида https://<юзер>--ragnell-ltx-gpu-generate.modal.run
Его вставим в env.GPU_URL воркера.

Стоимость: A100-80GB $2.50/ч → $30 = 12 часов GPU.
Один клип 121 кадр 768x512 за ~32 шага ≈ 3–5 минут.
Значит на старт — примерно 150–200 клипов бесплатно.
"""

import base64
import os
import tempfile

import modal

APP_NAME = "ragnell-ltx"

app = modal.App(APP_NAME)

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg", "libgl1", "libglib2.0-0")
    .pip_install(
        "torch==2.5.1",
        "diffusers>=0.35.0",        # LTX2Pipeline появился позже 0.32
        "transformers>=4.46.0",
        "accelerate>=1.1.0",
        "sentencepiece",
        "protobuf",
        "huggingface_hub",
        "fastapi[standard]",
        "soundfile",
    )
)

# Веса качаются один раз и живут между запусками — не тратят минуты GPU.
weights = modal.Volume.from_name("ragnell-weights", create_if_missing=True)


@app.cls(
    image=image,
    # 22B в bf16 = ~39 ГБ весов + энкодер. A100-80GB — самый дешёвый вариант, где влезает.
    # Хочешь дешевле: gpu="L40S" (48 ГБ) + fp8-квантование, см. README.
    gpu="A100-80GB",
    timeout=1800,
    scaledown_window=120,           # 2 минуты простоя → GPU отпускается, кредит не горит
    volumes={"/weights": weights},
    secrets=[modal.Secret.from_name("hf-token")],
)
class LTX:
    @modal.enter()
    def load_model(self):
        import torch
        from diffusers import LTX2Pipeline

        os.environ["HF_HOME"] = "/weights/hf"
        self.device = "cuda"

        self.pipe = LTX2Pipeline.from_pretrained(
            "Lightricks/LTX-2.5-Diffusers",
            dtype=torch.bfloat16,
            cache_dir="/weights/hf",
        )
        # Последовательная выгрузка: держим в VRAM только то, что нужно сейчас.
        self.pipe.enable_sequential_cpu_offload(device=self.device)
        self.pipe.vae.enable_tiling()

        weights.commit()
        print("LTX-2.5 ready")

    @modal.method()
    def generate(self, req: dict) -> dict:
        import torch
        from diffusers.utils import encode_video
        from diffusers.pipelines.ltx2.utils import DISTILLED_SIGMA_VALUES

        fps = float(req.get("fps", 24))

        # LTX требует 8n+1 кадров; кратность 32 по сторонам
        want = int(req.get("num_frames", round(fps * 5)))
        num_frames = max(9, (want // 8) * 8 + 1)
        width = max(256, (int(req.get("width", 768)) // 32) * 32)
        height = max(256, (int(req.get("height", 512)) // 32) * 32)

        gen = torch.Generator(device="cpu").manual_seed(int(req.get("seed", 42)))

        # Быстрый путь: distilled-расписание, guidance 1.0 (дистилляция не любит CFG)
        fast = bool(req.get("fast", True))
        kwargs = dict(
            prompt=req["prompt"],
            width=width,
            height=height,
            num_frames=num_frames,
            frame_rate=fps,
            generator=gen,
            output_type="np",
            return_dict=False,
        )
        if fast:
            kwargs["sigmas"] = DISTILLED_SIGMA_VALUES
            kwargs["guidance_scale"] = 1.0
            kwargs["audio_guidance_scale"] = 1.0
        else:
            kwargs["num_inference_steps"] = int(req.get("steps", 30))
            kwargs["guidance_scale"] = float(req.get("guidance", 3.0))
            kwargs["negative_prompt"] = req.get("negative") or (
                "worst quality, inconsistent motion, blurry, jittery, distorted"
            )

        video, audio = self.pipe(**kwargs)

        with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as f:
            path = f.name
        encode_video(
            video[0],
            fps=fps,
            audio=audio[0].float().cpu(),
            audio_sample_rate=self.pipe.vocoder.config.output_sampling_rate,
            output_path=path,
        )

        with open(path, "rb") as f:
            data = f.read()
        os.unlink(path)

        return {
            "b64": base64.b64encode(data).decode(),
            "ext": "mp4",
            "frames": num_frames,
            "width": width,
            "height": height,
            "model": "LTX-2.5",
        }


@app.function(image=image, timeout=300)
@modal.fastapi_endpoint(method="POST")
def generate(req: dict):
    """
    HTTP-точка для Cloudflare Worker (env.GPU_URL).
    Отвечает JSON: { b64, ext, frames, width, height }, префикс data не нужен.
    """
    return LTX().generate.remote(req)


@app.function(image=image, timeout=120)
@modal.fastapi_endpoint(method="GET")
def health():
    return {"ok": True, "backend": "modal", "model": "LTX-2.5", "author": "NeWerMoRe"}
