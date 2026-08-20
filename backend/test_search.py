import asyncio
from server import ensure_initialized, list_companies, DB_MODE
from fastapi import Request
from unittest.mock import MagicMock

async def test():
    await ensure_initialized()
    from server import db
    print(f"DB_MODE: {DB_MODE}")
    
    # Search for companies containing 'amazon' (case insensitive)
    docs = await db.companies.find({
        "$or": [
            {"company": {"$regex": "amazon", "$options": "i"}},
            {"role": {"$regex": "amazon", "$options": "i"}},
            {"branches": {"$regex": "amazon", "$options": "i"}},
            {"eligibility": {"$regex": "amazon", "$options": "i"}},
        ]
    }, {"_id": 0}).to_list(10)
    print("Direct regex search for 'amazon':")
    for d in docs:
        print(f"  - {d.get('company')} | role={d.get('role')}")
    
    # Test list_companies with text search for 'amazon'
    mock_request = MagicMock(spec=Request)
    mock_request.client = MagicMock()
    mock_request.client.host = "127.0.0.1"
    mock_request.headers = {}
    
    print("\nlist_companies text search for 'amazon':")
    result = await list_companies(q="amazon", page=1, page_size=10, request=mock_request)
    print(f"  Total: {result['total']}")
    for c in result['companies']:
        print(f"    - {c.get('company')}")

asyncio.run(test())