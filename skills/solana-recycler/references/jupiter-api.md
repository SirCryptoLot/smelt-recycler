# Jupiter Price API Reference

## Endpoint

```
GET https://price.jup.ag/v4/price?ids=<MINT_ADDRESS>[,<MINT_ADDRESS2>,...]
```

Pass one or more SPL token mint addresses as a comma-separated list.

## Example Request

```
GET https://price.jup.ag/v4/price?ids=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
```

## Example Response

```json
{
  "data": {
    "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v": {
      "id": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      "mintSymbol": "USDC",
      "vsToken": "USDC",
      "vsTokenSymbol": "USDC",
      "price": 1.0
    }
  },
  "timeTaken": 0.0023
}
```

## Trash Threshold Logic

A token account is flagged as recyclable if:

```
tokenBalance × price < 0.10  // USD
```

If `price` is missing or null (unlisted token), treat the account as zero-value and flag it as trash.
