from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
from ..prompt_intelligence.pipeline import PromptIntelligencePipeline

router = APIRouter(prefix="/prompt", tags=["prompt"])

# Initialize pipeline with root project directory
pipeline = PromptIntelligencePipeline(workspace_path=".")

# --- Pydantic Request/Response Schemas ---

class FileNodeSchema(BaseModel):
    path: Optional[str] = None
    filePath: Optional[str] = None
    fileName: Optional[str] = None
    content: str
    language: Optional[str] = ""
    confidence: Optional[float] = 0.5

class BuildPromptRequest(BaseModel):
    prompt: str
    context_files: List[Dict[str, Any]]
    system_prompt: Optional[str] = "You are a professional software co-pilot."

class OptimizePromptRequest(BaseModel):
    system_prompt: str
    user_prompt: str
    context_files: List[Dict[str, Any]]

# --- API Endpoints ---

@router.post("/build")
def build_prompt(req: BuildPromptRequest):
    """
    Builds an optimized prompt context by merging rules, memory,
    ranking relevant files, and applying compression if necessary.
    """
    try:
        res = pipeline.build_prompt_context(
            prompt=req.prompt,
            initial_context_files=req.context_files,
            system_prompt=req.system_prompt
        )
        return res
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/optimize")
def optimize_prompt(req: OptimizePromptRequest):
    """
    Directly optimizes a prompt string pair and file list by compressing whitespace
    and stripping comments.
    """
    try:
        opt = pipeline.prompt_optimizer.optimize_prompt(
            system_prompt=req.system_prompt,
            user_prompt=req.user_prompt,
            context_files=req.context_files
        )
        return opt
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/validate")
def validate_prompt(req: OptimizePromptRequest):
    """
    Validates formatting, size limits, and existence constraints of the built prompt payload.
    """
    try:
        is_valid, issues = pipeline.validate_prompt(
            system_prompt=req.system_prompt,
            user_prompt=req.user_prompt,
            context_files=req.context_files
        )
        return {
            "valid": is_valid,
            "issues": issues
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/metrics")
def get_prompt_metrics(prompt_len: int = 100, context_len: int = 1000):
    """
    Retrieve token cost mapping, char-to-token ratio, and estimated token usages.
    """
    try:
        # Dummy metrics mapping
        p_tok = pipeline.token_manager.estimate_tokens("x" * prompt_len)
        c_tok = pipeline.token_manager.estimate_tokens("x" * context_len)
        tot = p_tok + c_tok
        
        input_cost = (tot / 1000.0) * pipeline.token_manager.COST_PER_1K_INPUT
        
        return {
            "char_to_token_ratio": pipeline.token_manager.CHAR_TO_TOKEN_RATIO,
            "cost_per_1k_input_usd": pipeline.token_manager.COST_PER_1K_INPUT,
            "cost_per_1k_output_usd": pipeline.token_manager.COST_PER_1K_OUTPUT,
            "estimated_tokens": {
                "prompt": p_tok,
                "context": c_tok,
                "total": tot
            },
            "estimated_input_cost_usd": round(input_cost, 6)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
