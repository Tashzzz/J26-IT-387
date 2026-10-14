"""C4 router (owner: Rathnayaka).

Add this component's endpoints here. The contract for its output is in contracts/.
"""

from fastapi import APIRouter

router = APIRouter()


@router.get("/ping")
def ping():
    return {"component": "C4", "status": "ok"}
