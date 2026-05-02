# Uniswap pool research

Purpose: research swap support for CounterAgent across Ethereum mainnet, Base Sepolia, Celo testnet, and Celo mainnet.

Generated: 2026-05-02.

## Official integration facts

### Uniswap Trading API supported chains

The Uniswap Trading API supports swaps on these relevant chains:

| Chain | Chain ID | Trading API swap support | Universal Router 2.0 |
| --- | ---: | --- | --- |
| Ethereum mainnet | 1 | Yes | `0x66a9893cc07d91d95644aedd05d03f95e1dba8af` |
| Base mainnet | 8453 | Yes, with UniswapX support | `0x6ff5693b99212da76ad316178a184ab56d299b43` |
| Base Sepolia | 84532 | Yes via API, but route liquidity must be tested | `0x492e6456d9528771018deb9e87ef7750ef184104` |
| Celo mainnet | 42220 | Yes | `0xcb695bc5D3Aa22cAD1E6DF07801b061a05A0233A` |

The public Uniswap docs list testnet API support for Ethereum Sepolia, Unichain Sepolia, and Base Sepolia. They do **not** list Celo Alfajores or Celo Sepolia as Trading API testnets. Celo testnet support should therefore be treated as direct Uniswap v3 contract fallback only unless API testing proves otherwise.

### Celo Uniswap deployments

Celo official docs list:

| Network | Contract | Address |
| --- | --- | --- |
| Celo mainnet | v4 PoolManager | `0x288dc841A52FCA2707c6947B3A777c5E56cd87BC` |
| Celo mainnet | v4 PositionManager | `0xf7965f3981e4d5bc383bfbcb61501763e9068ca9` |
| Celo mainnet | v4 V4Quoter | `0x28566da1093609182dff2cb2a91cfd72e61d66cd` |
| Celo mainnet | v4 StateView | `0xbc21f8720babf4b20d195ee5c6e99c52b76f2bfb` |
| Celo mainnet | v4 UniversalRouter | `0xcb695bc5d3aa22cad1e6df07801b061a05a0233a` |
| Celo mainnet | v3 Factory | `0xAfE208a311B21f13EF87E33A90049fC17A7acDEc` |
| Celo mainnet | v3 QuoterV2 | `0x82825d0554fA07f7FC52Ab63c961F330fdEFa8E8` |
| Celo mainnet | v3 SwapRouter02 | `0x5615CDAb10dc425a742d643d949a7F474C01abc4` |
| Alfajores | v3 Factory | `0x229Fd76DA9062C1a10eb4193768E192bdEA99572` |
| Alfajores | v3 QuoterV2 | `0x3c1FCF8D6f3A579E98F4AE75EB0adA6de70f5673` |
| Alfajores | v3 UniversalRouter | `0x84904B9E85F76a421223565be7b596d7d9A8b8Ce` |

Celo Sepolia token contracts are documented by Celo, but the Uniswap docs currently list Alfajores for v3 deployments. CounterAgent should support both naming cases explicitly:

- `celo-mainnet` / chain `42220`: Trading API first + v4/v3 fallback.
- `celo-alfajores` / chain `44787`: v3 direct fallback only.
- `celo-sepolia` / chain `11142220`: token config only until Uniswap deployment addresses are verified.

## Token address candidates

### Ethereum mainnet

| Symbol | Address | Notes |
| --- | --- | --- |
| USDC | `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48` | Circle USDC |
| EURC | `0x1aBaEA1f7C830bD89Acc67eC4af516284b1bC33c` | Circle EURC |
| USDT | `0xdAC17F958D2ee523a2206206994597C13D831ec7` | Tether USDT |

### Base Sepolia

| Symbol | Address | Notes |
| --- | --- | --- |
| USDC | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` | Circle test USDC |
| EURC | `0x808456652fdb597867f38412077A9182bf77359F` | Circle test EURC |

### Celo mainnet

| Symbol | Address | Notes |
| --- | --- | --- |
| CELO | `0x471EcE3750Da237f93B8E339c536989b8978a438` | Native CELO token contract used directly by Uniswap |
| USDC | `0xcebA9300f2b948710d2653dD7B07f33A8B32118C` | Celo USDC |
| USDT | `0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e` | Celo USDT |
| cUSD / USDm | `0x765DE816845861e75A25fCA122bb6898B8B1282a` | Mento Dollar |
| cEUR / EURm | `0xD8763CBa276a3738E6DE85b4b3bF5FDed6D6cA73` | Mento Euro |

### Celo Alfajores

| Symbol | Address | Notes |
| --- | --- | --- |
| cUSD | `0x62492A644A588FD904270BeD06ad52B9abfEA1aE` | legacy Alfajores cUSD from Celo docs/search index |
| cEUR | `0xf9ecE301247aD2CE21894941830A2470f4E774ca` | legacy Alfajores cEUR from Celo docs/search index |
| CELO | `0x874069Fa1Eb16D44d622F2e0Ca25eeA172369bC1` | common Alfajores CELO token reference; verify before production demo |

### Celo Sepolia

| Symbol | Address | Notes |
| --- | --- | --- |
| USDC | `0x01C5C0122039549AD1493B8220cABEdD739BC44E` | Celo Sepolia USDC |
| USDT | `0xd077A400968890Eacc75cdc901F0356c943e4fDb` | Celo Sepolia USDT |
| USDm | `0xEF4d55D6dE8e8d73232827Cd1e9b2F2dBb45bC80` | Mento Dollar; docs also show older/additional USDm rows |
| EURm | `0x6B172e333e2978484261D7eCC3DE491E79764BbC` | Mento Euro; docs also show older/additional EURm rows |

## Onchain v3 pool checks

Checked with `UniswapV3Factory.getPool(tokenA, tokenB, fee)` across fee tiers `100`, `500`, `3000`, `10000`.

### Ethereum mainnet

| Pair | Fee | Pool | Liquidity | Notes |
| --- | ---: | --- | ---: | --- |
| USDC/USDT | 100 | `0x3416cF6C708Da44DB2624D63ea0AAef7113527C6` | `105071755745551882` | Strong stable pool |
| USDC/USDT | 10000 | `0xbb256c2F1B677e27118b0345FD2b3894D2E6D487` | `93217032590` | Exists, less relevant |
| EURC/USDT | 500 | `0x57Ba44f2aa654b02a2359B42AcE7C894Df1026A8` | `1050960714855` | Exists; direct EURC/USDC v3 pool not found in this scan |

### Base Sepolia

| Pair | Result |
| --- | --- |
| USDC/EURC | No v3 pool found through factory scan. CounterAgent should continue using Trading API first, then configured v4 pool/quoter fallback, then explicit dry-run fallback. |

### Celo mainnet

| Pair | Fee | Pool | Liquidity | Notes |
| --- | ---: | --- | ---: | --- |
| USDC/USDT | 100 | `0x1a810e0B6c2dd5629AFa2f0c898b9512C6F78846` | `93993927362192` | Strong stablecoin pool candidate |
| USDC/USDT | 500 | `0x2392AE4Ba6Daf181CE7343d237b695CdF525E233` | `0` | Exists, currently empty |
| USDC/USDT | 3000 | `0x9AfAc41cbd701a184a74475Aa8BDcda6a1a564a1` | `3500693` | Low liquidity |
| cUSD/USDC | 100 | `0x34757893070B0FC5de37AaF2844255fF90F7F1E0` | `166327273095450579661` | Strong Celo merchant pool candidate |
| cUSD/USDC | 500 | `0x08BCa9eBb553bAE038c6A06E548dBd179B4fE7aE` | `99994867190` | Exists |
| cUSD/USDC | 3000 | `0x26C55201b3b8148Dd66Eeb19D55555408701aD6C` | `0` | Exists, empty |
| cEUR/USDC | 100 | `0x116361f4f45e310347B43CD098FDFA459760EA7f` | `4826430565561414218` | Good EUR exposure route candidate |
| cEUR/USDC | 500 | `0xf552386896DF6482477CeDeBa8D5342F61359072` | `3162273` | Low liquidity |
| CELO/cUSD | 100 | `0x2d70cBAbf4d8e61d5317b62cBe912935FD94e0FE` | `137887414880147882059603` | Strong CELO route candidate |
| CELO/cUSD | 500 | `0x524375d0c6a04439128428F400B00eAE81a2e9E4` | `2789456458065308914` | Exists |
| CELO/cUSD | 3000 | `0x079e7A44F42E9cd2442C3B9536244be634e8f888` | `1297608553550033151135` | Exists |
| CELO/cUSD | 10000 | `0x05efB437e4e97EfEa6450321eca8d7585A731369` | `797911951666005006` | Exists |

### Celo Alfajores

| Pair | Result |
| --- | --- |
| cUSD/cEUR | No v3 pool found in the scan. |
| CELO/cUSD | No v3 pool found in the scan. |

## Product recommendations

1. Add Celo-aware token support in A3: `CELO`, `USDC`, `USDT`, `CUSD`, `CEUR`, and aliases `USDm`, `EURm` if we want UI labels to match Celo docs.
2. Add chain-aware defaults:
   - Ethereum mainnet: USDC/USDT/EURC.
   - Base Sepolia: USDC/EURC test pair, v4 fallback if configured.
   - Celo mainnet: USDC/USDT/cUSD/cEUR/CELO, Trading API first.
   - Celo Alfajores: direct v3 scan/fallback only unless Trading API later supports it.
3. Add `/execution/tokens` and `/execution/routes/preview` so the dashboard can show real route discovery instead of a hidden quote call.
4. Add a Treasury Autopilot panel that ranks route candidates by quote availability, liquidity, price impact, gas estimate, and approval requirement.
5. For the hackathon demo, Celo mainnet has the strongest live pool story: cUSD/USDC, cEUR/USDC, CELO/cUSD, and USDC/USDT pools all exist with measurable liquidity.
