# Blockchain Voting (Ganache + Truffle + React)

A simple local blockchain voting app with a Truffle smart contract and a React frontend.

## Prerequisites

- Node.js 18+ and npm
- Ganache UI running locally
- MetaMask browser extension

## Project Structure

- truffle-dVoting: Solidity contract, migrations, and build artifacts
- react-dVoting: React + Vite frontend

## Installation

1) Install frontend dependencies:

   cd react-dVoting
   npm install

2) (Optional) Install Truffle globally if not already installed:

   npm install -g truffle

## Configure Ganache + MetaMask

1) Start Ganache and confirm:
   - RPC: http://127.0.0.1:7545
   - Network ID: 5777

2) Add Ganache network to MetaMask:
   - Network name: Ganache 7545
   - RPC URL: http://127.0.0.1:7545
   - Chain ID: 5777 (or 1337 if Ganache reports it)
   - Currency symbol: ETH

3) Import an account from Ganache into MetaMask using a private key.

## Compile + Deploy the Contract

From the Truffle project:

cd truffle-dVoting
truffle compile --all
truffle migrate --network development --reset

This writes the contract artifact to:
truffle-dVoting/build/contracts/Voting.json

## Configure Frontend (Optional Fallback Address)

If you want an explicit fallback contract address, create a .env file:

react-dVoting/.env
VITE_CONTRACT_ADDRESS=0xYOUR_DEPLOYED_CONTRACT_ADDRESS

The app will use the deployed address in the artifact first, then the fallback.

## Run the App

cd react-dVoting
npm run dev

Open the URL shown by Vite (usually http://localhost:5173).

## Usage Flow

1) Connect MetaMask in the app.
2) Admin (deployer account) starts the election and manages candidates.
3) Admin whitelists voters (single or batch).
4) Whitelisted voters can vote once while the election is active.
5) Results and activity log update from on-chain data.

## App Pages

- /vote: Vote page
- /admin: Admin console
- /results: Results and activity log

## Troubleshooting

- Wrong network: switch MetaMask to Ganache (chain id 5777 or 1337).
- ABI mismatch: re-run compile + migrate and restart the frontend.
- Account not changing: disconnect the site in MetaMask and reconnect, or use the Reconnect button.
