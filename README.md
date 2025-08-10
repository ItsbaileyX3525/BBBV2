# BBB Client

BBB client uses UWebSocket.js to create a webserver where people can join and say hi to each other, the functionality of the app are limited to joining a room, speaking to people and that's it really.

### Why BBB?

Well if your asking why BBB is called that then I can't answer because I don't know, perhaps it's Bailey's baked beans but IDK.

If your asking why I made BBB then its because back in my early days of programming A online dude called "Squiggle" created a networking script for ursina and some examples with it, one of those examples was called "club_bear" which I now adapt into every application that has networking for a fun little project. This time it's html and typescript using the Uws.js.

### What is UWS?

UWS (UWebSocket.js) is a library created by some awesome people online that replaces the websocket library that the browser normally uses for a much more efficent and effctive networking solution that is used by discord and (I think) Trello to serve millions of people. For this project it really is overkill but I love performace!

The downside to all this performance is that you have to manually do a lot of things which means that development time of this application will be long but thanks to a previous basic application I made in UWS, I am able to reference that and adapt it to this!

## Features

 - [ ] Back-end
    - [x] Client connections
    - [x] Handle client messages
    - [x] Handle disconnects
    - [ ] Handle malformed data
    - [ ] Support joining custom servers
 - [ ] Front-end
    - [ ] Index page
        - [x] Join room
        - [x] Set username
        - [x] See live preview
        - [ ] Custom server input
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
        - [ ] Censor messages
        - [ ] Discord-like emoji support