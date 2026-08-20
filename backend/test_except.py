import asyncio
from server import ensure_initialized

async def test():
    await ensure_initialized()
    from server import db
    # Find companies with ALL EXCEPT
    docs = await db.companies.find(
        {"branches_canonical": {"$regex": "^ALL EXCEPT"}}, 
        {"_id": 0, "company": 1, "branches_canonical": 1}
    ).to_list(10)
    print("Companies with ALL EXCEPT:")
    for d in docs:
        print(f"  - {d.get('company')} | {d.get('branches_canonical')}")

asyncio.run(test())