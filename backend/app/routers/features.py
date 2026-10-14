"""C2 router (owner: Samarasinghe).

Add this component's endpoints here. The contract for its output is in contracts/.
"""

from fastapi import APIRouter

router = APIRouter()


@router.get("/ping")
def ping():
    return {"component": "C2", "status": "ok"}
