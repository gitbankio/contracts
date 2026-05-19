# Contributing to gitbank/contracts

Thanks for your interest in contributing.

## Before you start

- Open an issue first for non-trivial changes
- For bugs, include steps to reproduce and expected vs actual behavior
- For security issues, do not open a public issue - email the maintainers directly

## Development setup

```bash
pnpm install
npx hardhat compile
npx hardhat test
```

## Conventions

- Solidity 0.8.34, optimizer enabled (200 runs)
- All public functions must have NatSpec comments
- All state-changing functions require a nonce parameter for replay protection
- Fees collected via `_collectFee` helper only - never transfer directly
- No new external dependencies without discussion

## Testing

All tests must pass before opening a PR:

```bash
npx hardhat test
```

Add tests for any new function or behavior change.

## Pull requests

- One concern per PR
- Clear description of what changed and why
- Reference related issues with `Closes #<number>`

## License

By contributing, you agree that your contributions will be licensed under the Apache License 2.0.
