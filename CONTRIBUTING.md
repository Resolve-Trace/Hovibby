# Contributing to ResolveTrace

Thank you for your interest in contributing to ResolveTrace.

## Getting started

1. Fork the repository.
2. Clone your fork and follow the setup instructions in `README.md`.
3. Run the tests to confirm everything works: `cd packages/protocol && node --experimental-vm-modules ../../node_modules/jest/bin/jest.js --runInBand`

## Types of contributions

- **Bug fixes** — Please include a test that demonstrates the bug.
- **Protocol improvements** — Discuss significant protocol changes in an issue first.
- **Contract improvements** — Changes to the Soroban contract must include comprehensive tests.
- **Documentation** — Always welcome.
- **Storage adapters** — New storage adapters are welcome. Follow the `CaseStore` interface.

## Guidelines

- Do not introduce database dependencies.
- Do not store confidential case data on-chain.
- Do not invent cryptographic primitives.
- Add tests for all new protocol behavior.
- Keep the core protocol independent of the complaint UI.
- Update the protocol specification for any protocol changes.

## Pull requests

- Keep PRs focused on a single change.
- Include a clear description of what the change does and why.
- Ensure all tests pass.
- Run TypeScript type checking: `npm run typecheck`

## Code of conduct

Be respectful, constructive, and patient. See `CODE_OF_CONDUCT.md`.
