import json
from pathlib import Path

MODEL_CONFIG_PATH = Path.home() / ".musu/models.json"

def resolve_model(model_name):
    if not MODEL_CONFIG_PATH.exists():
        return model_name
        
    try:
        with open(MODEL_CONFIG_PATH, "r") as f:
            mapping = json.load(f)
        return mapping.get(model_name, model_name)
    except:
        return model_name

def patch_adapter_config(config):
    if not config or "model" not in config:
        return config
        
    original = config["model"]
    resolved = resolve_model(original)
    
    if original != resolved:
        print(f"[Model Resolver] Aliased '{original}' -> '{resolved}'")
        config["model"] = resolved
        
    return config

if __name__ == "__main__":
    # Test
    print(resolve_model("sonnet-latest"))
    print(resolve_model("unknown-model"))
