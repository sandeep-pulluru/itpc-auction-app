## Instructions to Setup Auction App.
*  Download the Auction App from https://github.com/sandp125/itpc-auction-app
*  cd itpc-auction-app.
*  docker-compose -f docker-compose-gettingstarted.yml up -d
*  cd artui
*  npm install
*  node deploy.js.
*  node app.js.   
    As part of app.js, we are recording 3 users and 2 images on the blockchain. Settings for the images and users is stored in         config.json.
*  open http://localhost:3000 to browse the Auction App. This will take you to a Home Screen which displays two images.


## Issues

1. Currently Auction App is using the fabric x86_64-0.7.0-snapshot-c7b3fe0 images to create the Peers and Orderer. We are currently working on moving to the new 1.0 Alpha Images.
2. A known limitation of the current application is that you can only post two images into the blockchain. Anything more than 2 images will return a "GRPC maximun message recieved error" when you query the image catalog from the home screen. The current chaincode encrypts the complete image file and stores it on the blockchain. As a result, when you query the image catalog, the total bytes returned is exceeding the maximum message size that can be recieved from a Peer. We are currenly looking at solutions to store image on a separate web server and only encrypt the metadata when storing on the blockchain.

