// Wallets = W[], External Address = C, N = Min number of wallets that must be engaging in buy/sell of the same token, T = timestamp window between Ai and Ai+1 belonging to W

import { Connection, clusterApiUrl, VersionedTransaction, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js"
import { getKeypairFromFile } from "@solana-developers/helpers"
import dotenv from "dotenv"
dotenv.config()

// modify, according to need
const W = ["55eGyLspgZdzgCnGXewSfFJo64zzgWDVP7eHAe6hmeJC", "HHAFVjwwdvsRzC45EC4gfPSrjJtYkfs6TT1NSciXYaqa"]
//external wallet(C, on which copy trade is executed)
const C = await getKeypairFromFile("~/.config/solana/id.json"); //make sure the local keypair jsoin is in this location
const N = 2;
const T = 15;
const K = 0.01;

//connection endpoint to mainnet-beta(using helius as the provider, a sample api key for demo purpose)
const connection = new Connection("https://mainnet.helius-rpc.com/?api-key=8b5f554c-f521-4d05-b6a6-eb3071c87768", "confirmed");

const apiKey = process.env.HELIUS_API_KEY || '8b5f554c-f521-4d05-b6a6-eb3071c87768' //sample api key, for demo purpose only;

const groupTradesByKey = trades =>
    trades.reduce((acc, trade) => {
        const key = `${trade.token}|${trade.activity}`; //ex: xyz|buy, def|sell, ...
        return {
            ...acc,
            [key]: [...(acc[key] || []), {
                wallet: trade.wallet,
                timestamp: trade.timestamp,
                amount: trade.amount
            }]
        };
    }, {});

// Finding clusters of trades within time window T with at least N unique wallets
const findTradeClusters = (trades, T, N) => {
    // Sort trades by timestamp(ascending order, starting from the first trade)
    const sortedTrades = [...trades].sort((a, b) => a.timestamp - b.timestamp);
    
    // sliding window approach
    let start = 0;
    let end = 0;
    let currentWallets = new Set();
    let result = [];

    while (end < sortedTrades.length) {
        // Add wallet at end pointer to current set
        currentWallets.add(sortedTrades[end].wallet);
        
        // While time window exceeds T, shrink window from start
        while (sortedTrades[end].timestamp - sortedTrades[start].timestamp > T) {
            // Before removing wallet at start, checking if it appears later in current window
            const walletAppearsLater = sortedTrades
                .slice(start + 1, end + 1)
                .some(trade => trade.wallet === sortedTrades[start].wallet);
                
            if (!walletAppearsLater) {
                currentWallets.delete(sortedTrades[start].wallet);
            }
            start++;
        }
        
        // If we have enough unique wallets, we found a valid cluster
        if (currentWallets.size >= N) {
            result.push({
                startTime: sortedTrades[start].timestamp,
                endTime: sortedTrades[end].timestamp,
                wallets: [...currentWallets],
                trades: sortedTrades.slice(start, end + 1)
            });
        }
        
        end++;
    }
    
    return result;
};

// Main filtering function
const filterTradesBySimilarActivities = (trades, N, T) => {
    // First group trades by token and activity
    const groupedTrades = groupTradesByKey(trades);
    
    // Process each group to find qualifying clusters
    return Object.entries(groupedTrades)
        .flatMap(([key, trades]) => {
            const [token, activity] = key.split('|');
            const clusters = findTradeClusters(trades, T, N);

            console.log("Grouped Trades: ",groupedTrades)
            
            // Only return clusters that meet <T time difference, min N wallets buying/selling same token
            return clusters.map(cluster => ({
                token,
                activity,
                startTime: cluster.startTime,
                endTime: cluster.endTime,
                uniqueWallets: cluster.wallets.length,
                trades: cluster.trades
            }));
        })
        .filter(cluster => cluster.uniqueWallets >= N);
};


async function parseTradesForWallet(walletAddress) {
    try{

    let transactionList = await connection.getSignaturesForAddress(new PublicKey(walletAddress), {limit:12});
    console.log("TRANSACTION LIST: ", transactionList)
    let signatureList = transactionList.map(transaction=>transaction.signature);
    console.log("SIGNATURE LIST: ", signatureList)
    // parsed details of each transaction 
    let data = []
    for (let txn of signatureList){
        const parsedTxn = await connection.getParsedTransaction(txn, {maxSupportedTransactionVersion:0, commitment: "confirmed"})
        data.push(parsedTxn)
    }
    console.log("Parsed TXNS: ",data)

    // NOTE - The HELIUS ADDRESS ENDPOINT may return an incomplete set of transactions due to internal timeouts during data retrieval.
    // In case it returns an empty array, proceed to use the sample trades list.
    // const signatures = await Promise.race([
    //     (async () => {
    //         const res1 = await fetch(`https://mainnet.helius-rpc.com/?api-key=${apiKey}`, {
    //             method: 'POST',
    //             headers: {
    //                 "Content-Type": "application/json"
    //             },
    //             body: JSON.stringify({
    //                 "jsonrpc": "2.0",
    //                 "id": "1",
    //                 "method": "getSignaturesForAddress",
    //                 "params": [
    //                     walletAddress
    //                 ]
    //             }),
    //         });

    //         if (!res1.ok) {
    //             throw new Error(`First API call failed with status: ${res1.status}`);
    //         }

    //         const sigData = await res1.json();
    //         return sigData.result.filter(r => r.signatures);
    //     })(),
    //     timeout(15000) //since RPC requests generally take a longer time
    // ]);

    // console.log("Signatures: ", signatures);

    // // Second API call with timeout
    // const data = await Promise.race([
    //     (async () => {
    //         const res2 = await fetch(`https://api.helius.xyz/v0/transactions?api-key=${apiKey}&commitment=confirmed`, {
    //             method: 'POST',
    //             headers: {
    //                 'Content-Type': 'application/json',
    //             },
    //             body: JSON.stringify({
    //                 transactions: [...signatures],
    //             }),
    //         });

    //         if (!res2.ok) {
    //             throw new Error(`Second API call failed with status: ${res2.status}`);
    //         }

    //         return await res2.json();
    //     })(),
    //     timeout(15000)
    // ]);

    console.log("Parsed TXN history: ",data)
    const trades = [];

    for (const transaction of data) {
        if (transaction.events && transaction.events.swap) {
            const swapEvent = transaction.events.swap;
            // Iterate through tokenInputs to identify buys
            if (swapEvent.tokenInputs) {
                for (const input of swapEvent.tokenInputs) {
                    if (input.mint) {
                        //TOKEN BUY USING SOL
                        trades.push({
                            wallet: walletAddress,
                            token: input.mint,
                            activity: "buy",
                            timestamp: Math.floor(transaction.timestamp/60), //minutes elapsed since the unix epoch
                            amount: parseFloat(input.rawTokenAmount.tokenAmount) / Math.pow(10, input.rawTokenAmount.decimals), // amount of token bought

                        });
                    }
                }
            }
            // Iterate through tokenOutputs to identify sells
            if (swapEvent.tokenOutputs) {
                for (const output of swapEvent.tokenOutputs) {
                    if (output.mint) {
                        //TOKEN SELL USING SOL
                        trades.push({
                            wallet: walletAddress,
                            token: output.mint,
                            activity: "sell",
                            timestamp: Math.floor(transaction.timestamp/60), //minutes elapsed since the unix epoch
                            amount: parseFloat(output.rawTokenAmount.tokenAmount) / Math.pow(10, output.rawTokenAmount.decimals), // Amount of token sold
                        });
                    }
                }
            }
        }
    }
    return trades;
    } catch(err){
        throw Error("There was an error processing this request")
    }
}

async function executeCopyTrade(tokenMint, activity, K){
    //USING JUPITER SWAP FUNCTIONALITY TO EXECUTE TRADE
    try{
        const [inputMint, outputMint] = activity === 'buy' ? ['So11111111111111111111111111111111111111112', tokenMint] : [tokenMint, 'So11111111111111111111111111111111111111112'];
        let priceOfSOLInTokenTerms = 0;
        try {
            const res = await fetch(`https://api.jup.ag/price/v2?ids=So11111111111111111111111111111111111111112&vsToken=${tokenMint}`);
            const priceData = await res.json()
            priceOfSOLInTokenTerms = Number(priceData.data[tokenMint].price) || 0;
        } catch (error) {
            console.error("Error fetching priceOfTokenInSOL:", error);
        }

        const tokenData = await connection.getParsedAccountInfo(new PublicKey(tokenMint));
        const tokenDecimals = tokenData.value?.data?.parsed.info.decimals || 6;

        const amount = activity == "buy" ? (K * LAMPORTS_PER_SOL) : (K * priceOfSOLInTokenTerms * (10**tokenDecimals))
        
        let quoteResponse;
        try {
            quoteResponse = await (
                await fetch(`https://quote-api.jup.ag/v6/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=100`)
            ).json();
        } catch (error) {
            console.error("Error fetching quoteResponse:", error);
        }

        const swapResponse = await (
            await fetch('https://quote-api.jup.ag/v6/swap-instructions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                quoteResponse,
                userPublicKey: wallet.publicKey.toBase58(),
                wrapUnwrapSOL: false,
                dynamicComputeUnitLimit: true,
                dynamicSlippage: {"minBps": 50, "maxBps": 300},
                prioritizationFeeLamports: {
                priorityLevelWithMaxLamports: {
                    maxLamports: 4000000,
                    global: false,
                    priorityLevel: "high"
                }
                }
            })
            })
        ).json();
        
  
        const transactionBase64 = swapResponse.swapTransaction;
        const transaction = VersionedTransaction.deserialize(Buffer.from(transactionBase64, 'base64'));
        console.log(transaction);

        // signing txn using external wallet C
        transaction.sign(C);

        const transactionBinary = transaction.serialize();
        console.log(transactionBinary);
        console.log(`Successfully Executed ${activity}`)
    } catch(err){
        throw Error("There was an error executing the trade")
    }
}

let allTrades = []
for (let wlt of W){
    const tradesForWallet = await parseTradesForWallet(wlt);
    console.log(`Trades for Wallet ${wlt}: ${tradesForWallet}`)
    allTrades.push(tradesForWallet)
}
allTrades = allTrades.flat();
console.log("Trade Activities in All Wallets: ", allTrades)

// you can use the sampleTrades example just for testing, if the allTrades is returned as an empty array
// this can happen due to 429 timeout in helius api endpoint(unrelated to the current code)
const sampleTrades = [
    { wallet: "addr1", token: "xyz", activity: "buy", timestamp: 12, amount: 0.4 },
    { wallet: "addr1", token: "xyz", activity: "buy", timestamp: 14, amount: 0.2 },
    { wallet: "addr1", token: "xyz", activity: "sell", timestamp: 18, amount: 0.5 },
    { wallet: "addr1", token: "abc", activity: "buy", timestamp: 20, amount: 0.2 },
    { wallet: "addr2", token: "xyz", activity: "buy", timestamp: 26, amount: 0.05 },
    { wallet: "addr2", token: "def", activity: "buy", timestamp: 29, amount: 0.15 },
];

//for the demo, if allTrades is empty(pertaining to JSON RPC error), we use sampleTrades as example
const eligibleTrades = (allTrades && (allTrades.length > 0)) ? filterTradesBySimilarActivities(allTrades, N, T) : filterTradesBySimilarActivities(sampleTrades, N, T)
console.log("Eligible Trades: ",eligibleTrades)

if (eligibleTrades && eligibleTrades.length > 0){
    console.log("Qualifying Copy Trade Activities: ")

    for (let trade of eligibleTrades){
        console.log(`${trade.activity} token ${trade.token}`)
        if(allTrades.length > 0){
            await executeCopyTrade(trade.token, trade.activity, K)
            console.log(`Successfully executed ${trade.activity} of token ${trade.token}`)
        }
    }
}