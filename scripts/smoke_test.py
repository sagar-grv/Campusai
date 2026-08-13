import sys, os
sys.path.insert(0, r'C:\Users\sagar\Downloads\placeos\placeos\backend')
os.environ['MONGO_URL'] = 'mongodb://localhost:27017'
os.environ['DB_NAME'] = 'test_database'

from fastapi.testclient import TestClient
import server

client = TestClient(server.app)

def show(label, resp):
    ok = resp.status_code < 300
    print(f"[{label}] status={resp.status_code} ok={ok}")
    return resp

# health
r = show('health', client.get('/api/health'))
print('   ', r.json())

# companies
r = show('companies', client.get('/api/companies', params={'q': 'tc', 'batch': '2025'}))
j = r.json()
print(f"    total={j.get('total')} sample={j.get('companies', [])[:1]}")

# companies/stats
r = show('companies/stats', client.get('/api/companies/stats'))
print(f"    total_companies={r.json().get('total_companies')} max={r.json().get('max_ctc_lpa')}")

# dashboard
r = show('dashboard', client.get('/api/dashboard'))
print(f"    total={r.json().get('total_companies')} avg={r.json().get('avg_ctc_lpa')}")

# chat non-stream
r = show('chat', client.post('/api/chat', json={'question': 'Which companies pay above 15 LPA?', 'top_k': 6}))
j = r.json()
print(f"    grounded={j.get('grounded')} matched={[c.get('company') for c in j.get('matched_companies', [])]}")

# chat stream
with client.stream('POST', '/api/chat', json={'question': 'What is the eligibility for Falkonry?', 'top_k': 6, 'stream': True}) as resp:
    print(f"[chat-stream] status={resp.status_code}")
    body = ''.join(resp.iter_text())

# chat backlog question
r = show('chat-backlogs', client.post('/api/chat', json={'question': 'Which companies allow backlogs?', 'top_k': 6}))
j = r.json()
print(f"    grounded={j.get('grounded')} matched={[c.get('company') for c in j.get('matched_companies', [])]}")

# eligibility
r = show('eligibility', client.post('/api/eligibility', json={'cgpa': 3.5, 'branch': 'CS', 'tenth_pct': 75, 'twelfth_pct': 75, 'has_backlog': False, 'batch': '2025'}))
j = r.json()
print(f"    summary={j.get('summary')}")

# compare
allc = client.get('/api/companies', params={'batch': '2025'}).json().get('companies', [])
ids = [c['id'] for c in allc[:2]]
r = show('compare', client.post('/api/companies/compare', json={'company_ids': ids}))
j = r.json()
print(f"    companies={len(j.get('companies', []))} has_ai={bool(j.get('ai_comparison'))}")

print('SMOKE DONE')