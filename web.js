const API_KEY = "";

const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);

app.use(express.static('public'));

var Web3 = require('web3');
var web3 = new Web3('https://bsc-dataseed.binance.org/');

const { StringDecoder } = require('string_decoder');
const decoder = new StringDecoder('utf8');

var colors = require('colors');

var fetch = require('node-fetch');

var contractCreatedUrl = 'https://api.bscscan.com/api?module=logs&action=getLogs&fromBlock=latest&topic0=0x0d3648bd0f6ba80134a33ba9275ac585d9d315f0ad8355cddefde31afa28d0e9&topic2=0x000000000000000000000000bb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c&apikey=' + API_KEY;

async function sleep(ms){
    return new Promise(resolve=>setTimeout(resolve, ms));
}

async function getHolders(address, totalSupply, typeString, numToPrint, toWeb){
    var title = '~~~ TOP ' + typeString + ' HOLDERS ~~~';
    var link = "https://bscscan.com/token/" + address + "#balances";
    console.log(colors.bold(title) + " (" + link + ")");
    if(typeString == 'LP'){
        toWeb.lpHolders = {}
        toWeb.lpHolders.link = link;
    } else {
        toWeb.tokenHolders = {}
        toWeb.tokenHolders.link = link;
    }
}

var lastFewTokens = [];
var maxTokensToDisplayOnPageLoad = 3;

async function checkForNewContracts(){
    return fetch(contractCreatedUrl).then(res=>res.json()).then(async data=>{
        if(data.status == "1"){
            console.log("");
            let address = "0x" + data.result[0].topics[1].slice(26);
            let pairAddress = "0x" + data.result[0].data.slice(26, 66);
            var tokenAbi = await fetch(`https://api.bscscan.com/api?module=contract&action=getabi&address=${address}&apikey=` + API_KEY);
            var tokenAbiJson = await tokenAbi.json();

            if(tokenAbiJson.result[0] != 'C'){
                var tokenAbiParsed = JSON.parse(tokenAbiJson.result);
                var tokenInterface = new web3.eth.Contract(tokenAbiParsed, address);
                var name = await tokenInterface.methods.name().call();
                var tokenTotalSupply = await tokenInterface.methods.totalSupply().call();
                var tokenDecimals = await tokenInterface.methods.decimals().call();
                console.log("======================".yellow)

                var tokenLink = "https://bscscan.com/token/" + address;

                console.log(colors.bold.green(name) + " (" + tokenLink + ")");
                var weiToBNB = Math.pow(10, (-1 * tokenDecimals)); 

                var toWeb = {
                    name: name,
                    tokenTotalSupply: tokenTotalSupply * weiToBNB,
                    tokenDecimals: tokenDecimals,
                    address: address,
                    pairAddress: pairAddress,
                    tokenLink: tokenLink,
                    timeDiscovered: new Date(Date.now())
                }

                console.log(colors.cyan("Total supply: ") + tokenTotalSupply * weiToBNB);
                if(tokenInterface.methods.hasOwnProperty('owner')){
                    var tokenOwner = await tokenInterface.methods.owner().call();
                    if(parseInt(tokenOwner) === 0){
                        console.log(colors.cyan("Owner: ") + colors.green(tokenOwner));
                    } else {
                        console.log(colors.cyan("Owner: ") + tokenOwner);
                    }
                    toWeb.tokenOwner = tokenOwner;
                }
                await getHolders(address, tokenTotalSupply, "TOKEN", 5, toWeb);
                //console.log(abiParsed);

                var first = true;
                do {
                    if(!first){
                        await sleep(3000);
                    }
                    var pairAbi = await fetch(`https://api.bscscan.com/api?module=contract&action=getabi&address=${pairAddress}&apikey=` + API_KEY);
                    var pairAbiJson = await pairAbi.json();
                    first = false;
                } while(pairAbiJson.result[0] == 'C')

                var pairAbiParsed = JSON.parse(pairAbiJson.result);
                var pairContractInterface = new web3.eth.Contract(pairAbiParsed, pairAddress);
                var pairTotalSupply = await pairContractInterface.methods.totalSupply().call();

                await getHolders(pairAddress, pairTotalSupply, "LP", 3, toWeb);

                var pairBnbHoldings = await pairContractInterface.methods.getReserves().call();
                var bnbInLiquidity = pairBnbHoldings._reserve1 * Math.pow(10, -18);
                toWeb.bnbInLiquidity = bnbInLiquidity;
                console.log(colors.bold("BNB Liquidity: ") + bnbInLiquidity + " BNB")

                console.log(colors.bold("----------------------"));
                console.log(colors.bold("https://exchange.pancakeswap.finance/#/swap?outputCurrency=%s"), address);
                toWeb.pcsLink = "https://exchange.pancakeswap.finance/#/swap?outputCurrency=" + address;
                console.log("======================".yellow)
                console.log("");

                if(lastFewTokens.length >= maxTokensToDisplayOnPageLoad){
                    lastFewTokens.shift();
                    lastFewTokens.push(toWeb);
                } else {
                    lastFewTokens.push(toWeb);
                }

                io.emit('new token', toWeb);

            }
        } else {
            process.stdout.write(".");
        }
    })

}

async function eventLoop(){
    while(1){
        await checkForNewContracts();
        await sleep(2000);
    }
}

eventLoop();

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

io.on('connection', (socket) => {
    console.log('a user connected');
    socket.on('disconnect', () => {
      console.log('user disconnected');
    });
    for(i=0;i<lastFewTokens.length;i++){
        console.log(lastFewTokens[i]);
        io.emit('new token', lastFewTokens[i]);
    }
});

server.listen(3000, () => {
  console.log('listening on *:3000');
});