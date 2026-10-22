import sys

if sys.stdout.encoding != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

from main import health, model_info

def test_functions():
    print("[1] Test health() function...")
    h = health()
    print("    -> Health:", h)
    assert h["architecture"] == "Single Global Model (One Model for All SKUs)"
    assert h["isModelFitted"] is True

    print("\n[2] Test model_info() function...")
    info = model_info()
    print("    -> Model status:", info["status"])
    print("    -> Total products trained:", info["totalProductsTrained"])
    print("    -> Feature count:", len(info["featureColumns"]))
    print("    -> Global Accuracy:", info["globalEvaluationMetrics"].get("accuracy"), "%")
    print("\n[3] All internal function checks passed successfully!")

if __name__ == "__main__":
    test_functions()
