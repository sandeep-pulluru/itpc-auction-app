$(document).ready(function() {
    //TODO: Make sure these apis execute only once
    //Get PEER URL
    mainApp.URL = "http://localhost:3000/auctioncc";
    mainApp.init();
    formApp.init();

    var closeAuctionsTimer = setInterval(function() {
        tableApp.CloseAuctionsPoll();
    }, 10000);
    //tableApp.init();
});
