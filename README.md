# gitbank/contracts

Solidity smart contracts for Gitbank - soul-bound vault system on Base L2.

## Contracts

| Contract | Description |
|---|---|
| `GitVault` | Per-user vault. Holds real ERC-20 assets, issues soul-bound GitTokens as claim certificates. |
| `GitVaultFactory` | Deploys vault clones via EIP-1167 minimal proxy pattern. |
| `GitToken` | Non-transferable ERC-20. Represents a locked position. No transfer, approve, or allowance. |

## Deployed (Base Sepolia)

| Contract | Address |
|---|---|
| GitVaultFactory | `0x3bB93f8915604961106cd6b682D5fd1082F32160` |
| GitVault impl | `0x88a94F47BAd707B3faF07e99dedcD38400a30057` |
| Deployer / feeCollector | `0x1e660A9A1f1F08AFEF9c03c96D66260122464CF2` |
| relayerSigner | `0x750E6E4C5DF3483a6235D3DDAB4087266D6EF510` |

## Key design decisions

- **Dual-signature security** - every state-changing vault call requires both the user execution keypair AND a short-lived ECDSA signature from the relayer (5-min deadline). A leaked execution key alone cannot drain the vault.
- **Soul-bound GitTokens** - cannot be phished or drained via approval exploits
- **GitHub permanent user ID** - vault identity anchored to immutable integer, survives username renames
- **Swap output whitelist** - `gitSwap` can only output WETH or USDC, enforced on-chain
- **2-step commit-reveal transfer** - `initTransfer` + `finalizeTransfer` prevents front-running
- **EIP-1167 minimal proxy clones** - cheap per-user vault deployment via factory

## Prerequisites

- Node.js 20+
- pnpm 10+

## Install

```bash
pnpm install
```

## Compile

```bash
npx hardhat compile
```

## Test

```bash
npx hardhat test
```

## Deploy to Base Sepolia

```bash
cp .env.example .env
# fill in DEPLOYER_PRIVATE_KEY and BASE_SEPOLIA_RPC_URL
npx hardhat run scripts/deploy.ts --network base-sepolia
```

## Environment variables

```env
DEPLOYER_PRIVATE_KEY=       # 0x-prefixed private key
BASE_SEPOLIA_RPC_URL=       # Base Sepolia RPC endpoint
BASE_MAINNET_RPC_URL=       # Base mainnet RPC endpoint
BASESCAN_API_KEY=           # For contract verification
FEE_COLLECTOR_ADDRESS=      # Defaults to deployer if not set
RELAYER_SIGNING_ADDRESS=    # Public address of relayer signer key (passed to factory constructor)
```

## Verify on Basescan

```bash
npx hardhat verify --network base-sepolia --constructor-args scripts/verify-args-factory.ts <factory-address>
```

## License

Apache 2.0. See [LICENSE](LICENSE).
