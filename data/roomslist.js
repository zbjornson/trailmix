var table = document.getElementById("rooms-list-table");
 
self.port.on("update", function(roomdata, status){
 
    if (status == "NoApiKey") {
        document.getElementById("messages").innerHTML = "Please set API key and domain in add-on preferences.";
    } else {
        document.getElementById("messages").innerHTML = "";
    }
 
    roomdata.forEach(function (room) {       
        var checked = room.subscribed,
            roomid = room.id,
            roomname = room.name;
         
        var row = table.insertRow(table.rows.length);
        var cell = row.insertCell(0);
     
        var label = document.createElement("label");
        label.className = "checkbox";
        label.textContent = roomname;
         
        var checkbox = document.createElement("input");
        checkbox.setAttribute("type", "checkbox");
        checkbox.setAttribute("value", roomid);
        if (checked)
            checkbox.checked = true;
             
        label.appendChild(checkbox);
        cell.appendChild(label);
             
    });
});
 
document.addEventListener("change", function() {
    var roomslist = {};
    Array.prototype.forEach.call(table.getElementsByTagName("input"), function (el) {
        roomslist[el.value] = el.checked;
    });
    self.port.emit("roomslist-change", roomslist);
}, true);