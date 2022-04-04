let data;
let editingBoards = false;
let socket;
let editing;

document.addEventListener('DOMContentLoaded', (event) => {
    // Parse the data
    data = JSON.parse(document.getElementById("group").innerText);
    document.getElementById("titleheader").innerText = data.group.groupname;
    document.getElementById("descheader").innerText = data.group.groupdesc;
    console.log(data);

    // Fill the event and board panels
    fillGroups();
    setOnClicks();

    // Create a map to store which boards are being edited
    // editing = new Map();
    // for (let i = 0; i < data.boards.length; i++) {
    //     editing.set(data.boards[i].boardid, false);
    // }

    // Set up the socket
    socket = io();
    // join the room for this group
    socket.emit('connection')
    // socket.join(data.group.groupID);

    socket.on("newEvent", async (event) => {
        console.log("Event received");
        console.log("Eventname: " + event.eventname);
        data.events.push(event);
        fillGroups();
    });

    if (data.email !== data.group.leader) {
        document.getElementById("addTagButton").style.display = "none";
        document.getElementById("editGroupButton").style.display = "none";
        document.getElementById("editBoardButton").style.display = "none";
    }
});

// Onclick to create a board
$('#createBoard').click(function (e) {
    e.preventDefault();
    let boardName = document.getElementById("boardName").value;
    let boardDesc = document.getElementById("boardDesc").value;


    $.ajax({
        type: 'POST',
        url: '/addBoard',
        data: {
            boardName: boardName,
            boardDesc: boardDesc,
            groupID: data.group.groupid
        },
        success: () => {
            alert("Board created successfully");
            document.getElementById("boardClose").click();
        },
        error: () => {
            console.log("Board not created");
        }
    });
});
// Onclick to send an invite
$('#inviteButton').click(function (e) {
    e.preventDefault();
    let inviteEmail = document.getElementById("inviteEmailInvite").value;
    let reqTypeInvite = document.getElementById("reqTypeInvite").value;
    $.ajax({
        type: 'POST',
        url: '/groupInviteUser',
        data: {
            inviteEmail: inviteEmail,
            userEmail: data.email,
            groupID: data.group.groupid,
            reqTypeInvite
        },
        success: (result) => {
            console.log("Invite Request was successfully Sent!");
            console.log(result);
        },
        error: () => {
            console.log("Invite Request was unsuccessfully Sent");
        }
    });
    return false;
});
// Onclick to create an event
$('#createEvent').click(function (e) {
    e.preventDefault();
    let eventName = document.getElementById("eventName").value;
    let eventDesc = document.getElementById("eventDesc").value;
    let datetimes = document.getElementById("datetimes").value;


    $.ajax({
        type: 'POST',
        url: '/createEvent',
        data: {
            eventName: eventName,
            eventDesc: eventDesc,
            datetimes: datetimes,
            groupID: data.group.groupid
        },
        statusCode: {
            200: function() {
                document.getElementById("eventName").value = "";
                document.getElementById("eventDesc").value = "";
                document.getElementById("eventClose").click();
            }
        }
    });
});
// Onclick to create a tag
$('#addTag').click(function (e) {
    e.preventDefault();
    let tagname = document.getElementById("tagnameCreate").value;
    console.log(tagname);

    $.ajax({
        type: 'POST',
        url: '/addGroupTag',
        data: {
            tagname: tagname,
            groupID: data.group.groupid,
        },
        statusCode:{
            201: () => {
                alert("Tag successfully added!");
                document.getElementById("tagClose").click();
                document.getElementById("tagnameCreate").value = "";
            },
            400: () => {
                alert("Tag not added! Group can't have more than 5 tags.");
                document.getElementById("tagClose").click();
            },
            403: () => {
                alert("Error adding tag!");
                document.getElementById("tagClose").click();
                document.getElementById("tagnameCreate").value = "";
            },
            404: () => {
                alert("Error adding tag!");
                document.getElementById("tagClose").click();
                document.getElementById("tagnameCreate").value = "";
            },
            503: () => {
                alert("Service unavailable. Please try again later.");
                document.getElementById("tagClose").click();
                document.getElementById("tagnameCreate").value = "";
            }
        }
    });
});
$('#deleteGroupButton').click(function (e) {
    e.preventDefault();
    $.ajax({
        type: 'POST',
        url: '/deleteGroup',
        data: {
            groupID: data.group.groupid,
            leader: data.group.leader,
        },
        statusCode: {
            400: () => {
                console.log("group unsuccsessfully deleted");
            }
        }
    });
});
$('#editGroupSubmit').click(function (e) {
    e.preventDefault();

    $.ajax({
        type: 'POST',
        url: '/editGroup',
        data: {
            groupname: document.getElementById("editGroupName").value,
            groupdesc: document.getElementById("editGroupDesc").value,
            groupID: data.group.groupid,
            private: document.getElementById("btnradio2").checked,
            tagname: document.getElementById("grouptag").value,
            url: document.getElementById("grouppic").value
        },
        statusCode: {
            201: (message) => {
                alert(message);
                document.getElementById("titleheader").innerText = document.getElementById("editGroupName").value;
                document.getElementById("descheader").innerText = document.getElementById("editGroupDesc").value;
                document.getElementById("groupInfoClose").click();
            },
            403: () => {
                alert("Cannot update group information in this context!");
                document.getElementById("groupInfoClose").click();
            },
            503: () => {
                alert("Unable to update group information at this time. Please try again later");
                document.getElementById("groupInfoClose").click();
            }
        }
    });
});
// Toggle visibility of board delete buttons
$('#editBoardButton').click((e) => {
    e.preventDefault();
    
    editingBoards = !editingBoards;

    if (editingBoards) {
        data.boards.forEach((board) => {
           document.getElementById("anchor" + board.boardid).className = "list-group-item";
           document.getElementById("delete" + board.boardid).style.display = "block";
           document.getElementById("edit" + board.boardid).style.display = "block";
        });
    } else {
        data.boards.forEach((board) => {
            let groupname = document.getElementById("editName" + board.boardid).value; 
            document.getElementById("boardName" + board.boardid).value = groupname;
            let groupdesc = document.getElementById("editDesc" + board.boardid).value; 
            document.getElementById("boardDesc" + board.boardid).value = groupdesc;
            
            document.getElementById("anchor" + board.boardid).className = "list-group-item list-group-item-action";
            document.getElementById("delete" + board.boardid).style.display = "none";
            document.getElementById("edit" + board.boardid).style.display = "none";
            document.getElementById("save" + board.boardid).style.display = "none";
        });
    }
});

function setOnClicks() {
    data.boards.forEach((board) => {
        $('#edit' + board.boardid).click(() => {
            // Show the input forms
            document.getElementById("editName" + board.boardid).style.display = "block";
            document.getElementById("editDesc" + board.boardid).style.display = "block";
            // Hide the elements
            document.getElementById("boardName" + board.boardid).style.display = "none";
            document.getElementById("boardDesc" + board.boardid).style.display = "none";
            // Show the save button for this group
            document.getElementById("save" + board.boardid).style.display = "block";
            // Hide the edit button for this group
            document.getElementById("edit" + board.boardid).style.display = "none";
        });
        $('#save' + board.boardid).click(() => {
            console.log("Save clicked!");
            boardname = document.getElementById("editName" + board.boardid).value;
            boarddesc = document.getElementById("editDesc" + board.boardid).value;


            $.ajax({
                url: '/editBoard',
                method: 'POST',
                data: {
                    boardid: board.boardid,
                    groupid: data.group.groupid,
                    boardname: boardname,
                    boarddesc: boarddesc,
                    email: data.email
                },
                statusCode: {
                    201: () => {
                        alert("Changes saved!");
                        document.getElementById("editName" + board.boardid).style.display = "none";
                        document.getElementById("editDesc" + board.boardid).style.display = "none";

                        document.getElementById("boardName" + board.boardid).style.display = "block";
                        document.getElementById("boardName" + board.boardid).innerText = boardname;
                        document.getElementById("boardDesc" + board.boardid).style.display = "block";
                        document.getElementById("boardDesc" + board.boardid).innerText = boarddesc;

                        document.getElementById("save" + board.boardid).style.display = "none";
                        document.getElementById("edit" + board.boardid).style.display = "block";
                    },
                    403: (err) => {
                        alert(err);
                    },
                    503: (err) => {
                        alert(err);
                    }
                }
            })
        })
    });
}



/*function userInvited(data) {
    console.log(data);
    //todo: display notification to user
}*/


function fillGroups() {
    // Wipe the lists
    document.getElementById("eventList").innerHTML = "";
    document.getElementById("boardList").innerHTML = "";

    // Populate the lists
    data.boards.forEach((b) => createBoard(b));
    data.events.forEach((e) => createEvent(e));
}
// Function to create event card
function createEvent (event) {
    console.log(event);
    
    let date = event.startdate + " " + event.starttime + " - " + event.enddate + " " + event.endtime;
    let url = "/eventHomePage/" + event.eventid;

    let eventAnchor = document.createElement("a");
    eventAnchor.className = "list-group-item list-group-item-action";
    eventAnchor.style.width = "100%";
    eventAnchor.href = url;

    let eventCard = document.createElement("div");
    eventCard.className = "d-flex w-100 justify-content-between";

    let eventName = document.createElement("h5");
    eventName.style.fontWeight = 600;
    console.log("event name: " + event.eventname);
    eventName.innerText = "" + event.eventname;

    let eventDate = document.createElement("small");
    eventDate.innerText = date;

    let eventHost = document.createElement("p");
    eventHost.className = "mb-1";
    eventHost.innerText = "Host: " + event.host;
    
    let eventDesc = document.createElement("p");
    eventDesc.className = "mb-1";
    eventDesc.innerText = event.eventdesc;

    eventCard.appendChild(eventName);
    eventCard.appendChild(eventDate);
    eventAnchor.appendChild(eventCard);
    eventAnchor.appendChild(eventHost);
    eventAnchor.appendChild(eventDesc);

    document.getElementById("eventList").appendChild(eventAnchor);
}

function createBoard (board) {
    // Anchor that holds the card
    let boardAnchor = document.createElement("a");
    boardAnchor.className = "list-group-item list-group-item-action";
    boardAnchor.href = "/groupBoardPage/" + data.group.groupid + "/" + board.boardid;
    boardAnchor.id = "anchor" + board.boardid;
    boardAnchor.style.width = "100%";

    // Card that holds the info
    let boardCard = document.createElement("div");
    boardCard.className = "d-flex";

    // First child of the card - the board's name
    let boardName = document.createElement("h5")
    boardName.innerText = board.boardname;
    boardName.id = "boardName" + board.boardid;

    // Hidden input for editing
    let boardNameInput = document.createElement("input");
    boardNameInput.style.display = "none";
    boardNameInput.value = board.boardname;
    boardNameInput.id = "editName" + board.boardid;

    // Second child of the card - the board's description
    let boardDesc = document.createElement("span");
    boardDesc.className = "mb-1";
    boardDesc.innerText = board.boarddesc;
    boardDesc.id = "boardDesc" + board.boardid;

    // Hidden input for editing
    let boardDescInput = document.createElement("input");
    boardDescInput.style.display = "none";
    boardDescInput.value = board.boarddesc;
    boardDescInput.id = "editDesc" + board.boardid;

    // Save changes
    let saveButton = document.createElement("button");
    saveButton.className = "btn btn-primary btn-sm";
    let saveIcon = document.createElement("i");
    saveIcon.className = "bi bi-save";
    saveButton.id = "save" + board.boardid;
    saveButton.style.display = "none";
    saveButton.append(saveIcon);

    // Edit Button
    let editButton = document.createElement("button");
    editButton.className = "btn btn-primary btn-sm";
    let editIcon = document.createElement("i");
    editIcon.className = "bi bi-pencil-square";
    editButton.append(editIcon);
    editButton.id = "edit" + board.boardid;
    editButton.style.display = "none";

    // Delete Button
    let deleteButton = document.createElement("button");
    deleteButton.className = "btn btn-danger btn-sm";

    let deleteIcon = document.createElement("i");
    deleteIcon.className = "bi bi-trash-fill";

    deleteButton.appendChild(deleteIcon);
    deleteButton.id = "delete" + board.boardid;
    deleteButton.style.display = "none";

    // Put it all together
    boardAnchor.append(boardName, boardNameInput, boardDesc, boardDescInput);
    boardCard.append(boardAnchor, saveButton, editButton, deleteButton);

    document.getElementById("boardList").appendChild(boardCard);
}
