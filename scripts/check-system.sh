#!/bin/bash
echo "=== HyperDex System Status ==="

echo ""
echo "1. Backend:"
curl -s http://localhost:4000/health | python3 -m json.tool

echo ""
echo "2. Maker SDK:"
curl -s http://localhost:3001/health | python3 -m json.tool

echo ""
echo "3. Quote test (USDC -> EURC):"
curl -s -X POST http://localhost:4000/api/quote \
  -H 'Content-Type: application/json' \
  -d '{
    "tokenIn":  "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA",
    "tokenOut": "CDOIV56NSBNVNZN4XPTOT7JVRK6AW4RUISEPYUZYIIKMVIY7X3OH4S5X",
    "amountIn": "10000000",
    "takerAddress": "GABIRDNI5LREXRZQ7RS34CE7WOWL6ZQSK3UVFJAH4R54P255OSHNEP5A"
  }' | python3 -m json.tool

echo ""
echo "4. Frontend:"
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost:3000

echo ""
echo "5. Vault inventory:"
curl -s http://localhost:4000/api/makers/GALNCMRJ2GCQ34RH7L55HZLUCZ3EHDIKPWTNTWDGVJ4FJWCP5GDVA726/inventory | python3 -m json.tool

echo ""
echo "=== Done ==="
