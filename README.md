# BBB Client

BBB client uses UWebSocket.js to create a webserver where people can join and say hi to each other, the functionality of the app are limited to joining a room, speaking to people and that's it really.

## Why BBB?

Well if your asking why BBB is called that then I can't answer because I don't know, perhaps it's Bailey's baked beans but IDK.

If your asking why I made BBB then its because back in my early days of programming A online dude called "Squiggle" created a networking script for ursina and some examples with it, one of those examples was called "club_bear" which I now adapt into every application that has networking for a fun little project. This time it's html and typescript using the Uws.js.

## What is UWS?

UWS (UWebSocket.js) is a library created by some awesome people online that replaces the websocket library that the browser normally uses for a much more efficent and effctive networking solution that is used by discord and (I think) Trello to serve millions of people. For this project it really is overkill but I love performace!

The downside to all this performance is that you have to manually do a lot of things which means that development time of this application will be long but thanks to a previous basic application I made in UWS, I am able to reference that and adapt it to this!

## Features

 - [x] Back-end
    - [x] Client connections
    - [x] Handle client messages
    - [x] Handle disconnects
    - [x] Handle malformed data
    - [x] Support joining custom servers
 - [x] Front-end
    - [x] Index page
        - [x] Join room
        - [x] Set username
        - [x] See live preview
        - [x] Custom server input
        - [x] Save custom servers to a list
    - [x] 404 page
        - [x] 404 image
        - [x] Redirection
    - [x] Room page
        - [x] Handle client connect
            - [x] Create player image
            - [x] Bind keys
            - [x] Connect to server
        - [x] Handle previous connections
        - [x] Handle new connections
        - [x] Display messages
        - [x] Support different resolutions
        - [x] Noramlise speed
        - [x] Censor messages
        - [x] Discord-like emoji support
        - [x] Add more emojis (optional)

## I want more features!!!

Don't hesitate to add me on discord 'sirfrogster55' and suggest some ideas and I will implement them!

# Installing on your local server

Installing and setting up BBB for youself is really really simple!

To start off clone this repo into your dir location 

`git clone https://github.com/ItsbaileyX3525/BBBV2.git`

After that you'll want to modify server.js and set the port to what your development port is.

Open main.ts in src/main.ts and set your development ip (localhost most likely) and port

Open main.ts and do the same thing

BOOM! You have now made it so you can setup the BBB server and connect to it from your own machine, from here you can create modifications to the server and the client, maybe you want to add custom images to the player if then you can and to ensure that you can still connect to the main server any of the new commands like setting the skins just get ingnored for compatability! 

Happy coding!

# Opening a PR

I love contributions! If you have a way to make this project better like maybe setting a dotenv file or improving server performance or even just adding new features do not hesitiate to open a pull request!

I will review the pull request and if it works and there is nothing fishy, I will merge it for every on the main server to see!