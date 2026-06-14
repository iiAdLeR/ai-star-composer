import os
from pathlib import Path

from dotenv import load_dotenv

REQUIRED_DIRS = [
    "scripts",
    "services",
    "frontend",
    "data",
    "outputs",
    "backend",
    "docs",
    "assets",
    "assets/soundfonts",
]


def ensure_project_layout(base_dir="."):
    base = Path(base_dir)
    created = []
    for rel in REQUIRED_DIRS:
        path = base / rel
        if not path.exists():
            path.mkdir(parents=True, exist_ok=True)
            created.append(str(path))
    return created


def init_environment(base_dir="."):
    base = Path(base_dir)
    env_path = base / ".env"
    env_example_path = base / ".env.example"
    if env_path.exists():
        load_dotenv(dotenv_path=env_path)
        return ".env loaded"
    if env_example_path.exists():
        return "No .env found. Copy .env.example to .env and fill values."
    return "No .env or .env.example found."


if __name__ == "__main__":
    created_dirs = ensure_project_layout(".")
    message = init_environment(".")
    if created_dirs:
        print("Created directories:")
        for d in created_dirs:
            print(f"- {d}")
    else:
        print("Project directories already exist.")
    print(message)
