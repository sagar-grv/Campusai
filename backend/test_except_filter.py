import asyncio
from server import ensure_initialized, list_companies
from fastapi import Request
from unittest.mock import MagicMock

async def test():
    await ensure_initialized()
    
    mock_request = MagicMock(spec=Request)
    mock_request.client = MagicMock()
    mock_request.client.host = "127.0.0.1"
    mock_request.headers = {}
    
    # Test branch filter for CS (should include Infosys)
    print("Branch filter for CS (should include Infosys):")
    result = await list_companies(branch="CS", page=1, page_size=20, request=mock_request)
    infosys_found = False
    for c in result['companies']:
        if c.get('company') == 'Infosys':
            infosys_found = True
            print(f"  - Found: {c.get('company')} | branches_canonical={c.get('branches_canonical')}")
    if not infosys_found:
        print("  Infosys NOT found in CS results!")
    
    # Test branch filter for MECH (should exclude Infosys)
    print("\nBranch filter for MECH (should exclude Infosys):")
    result = await list_companies(branch="MECH", page=1, page_size=20, request=mock_request)
    infosys_found = False
    for c in result['companies']:
        if c.get('company') == 'Infosys':
            infosys_found = True
            print(f"  - Found: {c.get('company')} | branches_canonical={c.get('branches_canonical')}")
    if not infosys_found:
        print("  Infosys correctly excluded from MECH results")
    
    # Test branch filter for CIVIL (should exclude Infosys)
    print("\nBranch filter for CIVIL (should exclude Infosys):")
    result = await list_companies(branch="CIVIL", page=1, page_size=20, request=mock_request)
    infosys_found = False
    for c in result['companies']:
        if c.get('company') == 'Infosys':
            infosys_found = True
            print(f"  - Found: {c.get('company')} | branches_canonical={c.get('branches_canonical')}")
    if not infosys_found:
        print("  Infosys correctly excluded from CIVIL results")

asyncio.run(test())