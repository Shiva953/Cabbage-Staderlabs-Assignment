Here's the proposed solution, for the given [Problem Statement](https://docs.google.com/document/d/19mZaFCUWOlGaoFU3a2ZDtDCswQMpsWXsGDGtzM2MdWI/edit?tab=t.0#heading=h.ll7ihqhh5v48)


### Objective

Automatically detect and copy trading activities that meet specific criteria:
- Track trading activities (buying or selling tokens) across a predefined list of wallets
- Identify collective trading patterns
- Execute copy trades on a target wallet based on predefined rules

### Key Components

- **Wallets (W[])**: A list of Solana wallet addresses to monitor
- **Target Wallet (C)**: The wallet that will execute copy trades
- **Minimum Wallets (N)**: Minimum number of wallets needed to trigger a trade
- **Time Window (T)**: Maximum time interval between trades
- **Trade Amount (K)**: Fixed amount of SOL to use for each copy trade

## Features

- Fetch wallet transaction histories using Helius API
- Parse and categorize token trades (buy/sell)
- Detect trade clusters meeting specified criteria `(min N wallets buying/selling the same token, within a time window T)`
- Execute automated trades via Jupiter Aggregator
- Implements retry mechanism for API calls
- Configurable trade detection parameters

## Stack

- Node.js
- @solana/web3.js
- Helius API
- Jupiter Aggregator API


## Configuration Parameters

- `W`: Array of wallet addresses to monitor
- `C`: Target wallet address for trade copying
- `N`: Minimum number of wallets trading (default: 2)
- `T`: Time window in minutes (default: 15)
- `K`: Trade amount in SOL (default: 0.01)

## How to Run

1. Clone the repo locally: `git clone https://github.com/Shiva953/Cabbage-Staderlabs-Assignment.git`
2. cd into the repo: `cd cabbage-staderlabs-assignment`
3. Run `npm i` to install dependencies
4. (Optional) create a .env file and add your HELIUS_API_KEY[Even though we are using a default one]
5. Replace `W, C, N, T` with your desired address/values (C is a keypair, for demo we have used local wallet)
6. Run `node src/index.js`

This should log the eligible trades and the elgibile copy trade activity.

## Workflow

1. Fetch transactions for monitored wallets
2. Parse and categorize trades
3. Group trades by token and activity
4. Apply time window and wallet count filters
5. Execute copy trades on target wallet

## Example Scenario

```
W = ["wallet1", "wallet2", "wallet 3"]
N = 2    // Minimum 2 wallets trading
T = 15   // Within 15 minutes Time Window
K = 0.01 // 0.01 SOL per trade


- wallet1 buys token XYZ at min 12
- wallet1 sells token XYZ at min 14
- wallet2 buys token XYZ at min 18
- wallet2 buys token DEF at min 20

- Triggers a copy trade for buying token XYZ for 0.01 SOL
```


Note: Use a dedicated trading wallet. For this demo, locally installed wallet is being used(generally not recommended for practical purposes).