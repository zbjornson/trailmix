var notifications = require("sdk/notifications");
var { ToggleButton } = require("sdk/ui/button/toggle");
var timer = require("sdk/timers");
var Request = require("sdk/request").Request;
var Panel = require("sdk/panel").Panel;
var data = require("sdk/self").data;
var ss = require("sdk/simple-storage");
var rsp = require("sdk/simple-prefs"),
    sp = rsp.prefs;
var tabs = require("sdk/tabs");
var events = require("sdk/system/events");
var {Cc, Ci} = require("chrome");
     
var trailmixTab;
 
exports.main = function() {
 
    var rooms = [], users = {};
 
    /**** Notification bits. ****/
    var notificationQueue = [];
 
    // Queue messages
    function queueNotify(message) {
        notificationQueue.push(message);
    }
     
    // Periodically dequeue messages
    timer.setInterval(function () {
        if (notificationQueue.length)
            notify(notificationQueue.shift());
    }, 1000);
     
    // Load a sound.
    var uri = Cc['@mozilla.org/network/io-service;1']
        .getService(Ci.nsIIOService)
        .newURI(data.url("./35276.wav"), null, null);
    var sound = Cc['@mozilla.org/sound;1'].createInstance(Ci.nsISound);

    // Display a message
    function notify(message) {
        if (sp.playSound) {
            sound.play(uri);
        }
        notifications.notify({
            title: "(" + message.room.name + ") " + message.user,
            text: message.body,
            iconURL: message.icon,
            data: "" + message.room.id,
            onClick: function (data) {
                trailmixTab.url = "https://"+domain+".campfirenow.com/room/" + data;
                trailmixTab.activate();
            }
        });
    }
     
    /**** Panel bits. ****/
    // Icon to click on to bring up the rooms
    var actionbutton = ToggleButton({
        id: "trail-mix-widget",
        label: "Trail Mix",
        icon: "./campfire.ico",
        onChange: function (state) {
            if (state.checked) {
                rooms_list_panel.show({
                    position: actionbutton
                });
            }
        }
    });

    // Make the panel
    var rooms_list_panel = Panel({
        width: 300,
        height: 324,
        contentURL: data.url("roomsList.html"),
        contentScriptFile: data.url("roomslist.js"),
        onHide: function () {
            actionbutton.state("window", {checked: false});
        }
    });

    // Listen to when the user changes subscriptions to rooms.
    rooms_list_panel.port.on("roomslist-change", function (v) {
        rooms.forEach(function (room) {
            room.subscribed = v[room.id];
            // Save preference to storage.
            ss.storage["subscribe-"+room.id] = v[room.id];
        });
    });


    /**** Tab bits. ****/
    if (domain != undefined && domain !== "") {
        tabs.open({
            url: "https://" + domain + ".campfirenow.com",
            isPinned: true,
            inBackground: true,
            onOpen: function (tab) {
                trailmixTab = tab;
            }
        });
         
        // TODO Firefox seems to restore the tab anyway?
        events.on("quit-application-requested", function () {
            trailmixTab.close();
        });
    }
     
    /**** Web bits. ****/
    // Memoized user name lookup by ID.
    function getUserData(id, cb) {
        if (users[id]) return cb(users[id]);
        Request({
            url: "https://" + apikey + ":X@" + domain + ".campfirenow.com/users/" + id + ".json",
            header: {"User-Agent":"Trail Mix Firefox Plugin (bjornson@stanford.edu)"},
            onComplete: function (response) {
                var user = response.json.user;
                users[user.id] = {
                    name: user.name,
                    avatar: user.avatar_url
                };
                 
                cb(users[user.id]);
            },
            onError: function (error) {
                console.error("Trail Mix error:", error);
            }
        }).get();
    }
     
    var apikey = sp.apikey,
        domain = sp.domain,
        regex = sp.filterRegex,
        pr;
    
    // Get info about the rooms
    if (apikey != undefined && apikey !== "" && domain != undefined && domain !== "") {
        init();
    } else {
        rooms_list_panel.port.emit("update", rooms, "NoApiKey");
    }
     
    function init() {
        Request({
            url: "https://" + apikey + ":X@" + domain + ".campfirenow.com/rooms.json",
            header: {"User-Agent":"Trail Mix Firefox Plugin (bjornson@stanford.edu)"},
            onComplete: setupRooms,
            onError: function (error) {
                console.error("Trail Mix error:", error);
            }
        }).get();
    }
     
    // Reinitialize if the user clicks "Apply" after configuring.
    rsp.on("applyButton", function () {
        apikey = sp.apikey;
        domain = sp.domain;
        regex = sp.filterRegex || "";
        if (apikey == undefined || apikey === "" || domain == undefined || domain === "")
            return;
        init();
    });
 
    function setupRooms(roomsResponse) {
 
        rooms = roomsResponse.json.rooms.map(function (room) {
            if (ss.storage["subscribe-"+room.id]) {
                return {id: room.id, name: room.name, subscribed: true};
            } else {
                return {id: room.id, name: room.name};
            }
        });
 
        // Periodically poll.
        // Note: streaming can be done like this:
        /*
        var x = new XMLHttpRequest();
        x.open("GET", "https://streaming.campfirenow.com/room/#/live.json");
        x.responseType = "moz-chunked-text";
        x.setRequestHeader("Authorization", "Basic " + btoa(token+ ":X"));
        x.onreadystatechange = function () { console.log(x.responseText) };
        x.send();
        */

        timer.setInterval(function () {
             
            rooms.forEach(function (room) {
             
                // Either get new messages, or the last message as a starting point.
                var content = room.lastMessageId ?
                    {"since_message_id": room.lastMessageId} :
                    {"limit": 1};
                 
                Request({
                    url: "https://" + apikey + ":X@" + domain + ".campfirenow.com/room/" + room.id + "/recent.json",
                    content: content,
                    header: {"User-Agent":"Trail Mix Firefox Plugin (bjornson@stanford.edu)"},
                    onComplete: function (response) {
                        var messages = response.json.messages;
                        
                        messages.forEach(function (message) {
                            if (!room.lastMessageId)
                                return room.lastMessageId = message.id;
                            
                            room.lastMessageId = message.id;
                             
                            if (!message.user_id || !message.body)
                                return; // Nothing here!
                                 
                            getUserData(message.user_id, function (userData) {
                                if (room.subscribed) {
                                    
                                    if (regex !== "" && !(new RegExp(regex, "i")).test(message.body)) {
                                        return;
                                    }

                                    queueNotify({
                                        room: room,
                                        user: userData.name,
                                        body: message.body,
                                        icon: userData.avatar
                                    });

                                }
                            });
                             
                        });
                    },
                    onError: function (error) {
                        console.error("Trail Mix error:", error);
                    }
                }).get();
             
            });
             
        }, 3000);
         
        rooms_list_panel.port.emit("update", rooms, "OK");
         
    }
 
};
 
exports.onUnload = function (reason) {
    if (trailmixTab)
        trailmixTab.close();
};