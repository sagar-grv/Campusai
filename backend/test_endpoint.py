import asyncio
from server import ensure_initialized, list_companies
from fastapi import Request
from unittest.mock import MagicMock

async def test():
    await ensure_initialized()
    
    # Import db after initialization
    from server import db
    
    # Check if using mock or real DB
    try:
        await db.client.admin.command("ping")
        print("DB mode: real")
    except:
        print("DB mode: mock")
    
    count = await db.companies.count_documents({})
    print(f"Total companies: {count}")
    
    # Test basic query
    docs = await db.companies.find({}, {"_id": 0}).limit(5).to_list(5)
    for d in docs:
        print(f"  - {d.get('company')} | batch={d.get('batch')} | ctc_lpa={d.get('ctc_lpa')} | branches_canonical={d.get('branches_canonical')}")
    
    # Test list_companies endpoint logic
    print("\n--- Testing list_companies endpoint ---")
    
    # Create mock request
    mock_request = MagicMock(spec=Request)
    mock_request.client = MagicMock()
    mock_request.client.host = "127.0.0.1"
    mock_request.headers = {}
    
    # Test 1: Basic pagination
    print("\nTest 1: Basic pagination (page=1, page_size=3)")
    result = await list_companies(page=1, page_size=3, request=mock_request)
    print(f"  Total: {result['total']}, Page: {result['page']}, Page size: {result['page_size']}")
    for c in result['companies']:
        print(f"    - {c.get('company')}")
    
    # Test 2: Text search
    print("\nTest 2: Text search (q='google')")
    result = await list_companies(q="google", page=1, page_size=10, request=mock_request)
    print(f"  Total: {result['total']}")
    for c in result['companies']:
        print(f"    - {c.get('company')}")
    
    # Test 3: Batch filter
    print("\nTest 3: Batch filter (batch='2023-24')")
    result = await list_companies(batch="2023-24", page=1, page_size=10, request=mock_request)
    print(f"  Total: {result['total']}")
    for c in result['companies']:
        print(f"    - {c.get('company')} | batch={c.get('batch')}")
    
    # Test 4: Branch filter
    print("\nTest 4: Branch filter (branch='CS')")
    result = await list_companies(branch="CS", page=1, page_size=10, request=mock_request)
    print(f"  Total: {result['total']}")
    for c in result['companies']:
        print(f"    - {c.get('company')} | branches_canonical={c.get('branches_canonical')}")
    
    # Test 5: Min CTC filter
    print("\nTest 5: Min CTC filter (min_ctc=10)")
    result = await list_companies(min_ctc=10, page=1, page_size=10, request=mock_request)
    print(f"  Total: {result['total']}")
    for c in result['companies']:
        print(f"    - {c.get('company')} | ctc_lpa={c.get('ctc_lpa')}")
    
    # Test 6: Sort by CTC desc
    print("\nTest 6: Sort by CTC desc")
    result = await list_companies(sort="ctc_desc", page=1, page_size=5, request=mock_request)
    print(f"  Total: {result['total']}")
    for c in result['companies']:
        print(f"    - {c.get('company')} | ctc_lpa={c.get('ctc_lpa')}")
    
    # Test 7: Combined filters
    print("\nTest 7: Combined filters (batch='2023-24', branch='CS', min_ctc=5)")
    result = await list_companies(batch="2023-24", branch="CS", min_ctc=5, page=1, page_size=10, request=mock_request)
    print(f"  Total: {result['total']}")
    for c in result['companies']:
        print(f"    - {c.get('company')} | batch={c.get('batch')} | ctc_lpa={c.get('ctc_lpa')} | branches_canonical={c.get('branches_canonical')}")

asyncio.run(test())