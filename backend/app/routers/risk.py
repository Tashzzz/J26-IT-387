"""C3 router (owner: Rizma).

Add this component's endpoints here. The contract for its output is in contracts/.
"""

from fastapi import APIRouter

router = APIRouter()


@router.get("/ping")
def ping():
    return {"component": "C3", "status": "ok"}
