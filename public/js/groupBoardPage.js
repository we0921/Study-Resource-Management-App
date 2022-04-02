let currentPage = 1;
let maxPages = 1;
let postsPerPage = 10;
let data;
let length = 0;
let postDraft = "";
let socket;

// Functions to run at the beginning of the page
window.onload = async () => {
    // Set up the socket
    socket = io();
    // Emit connection => join the room for this board
    socket.emit("connection");

    // Handle a new post
    socket.on("newMessage", async (d) => {
        console.log("MESSAGE RECEIVED")
        await onNewPost(d);
    });
    // Handle a change in votes
    socket.on("changeVote", async (d) => {
        console.log("VOTE RECEIVED");
        await onPostVote(d);
    });

    // Error handling
    socket.on("connect_error", (err) => {
        console.log("Connection error: " + err);
    });
    socket.on("disconnect", (err) => {
        console.log("Disconnect: " + err);
    })


    // Parse the data initially sent to the page
    data = JSON.parse(document.getElementById("data").innerText);
    console.log(data);

    document.getElementById("titleheader").innerText = data.groupInfo[0].groupname;
    document.getElementById("descheader").innerText = data.groupInfo[0].groupdesc;
    document.getElementById("groupName").innerText = data.groupInfo[0].groupname + " - " + data.boardInfo[0].boardname;

    // Retrieve which page we're on
    // and how many pages of posts exist
    length = data.posts.length;
    maxPages = Math.floor(length / (postsPerPage + 1)) + 1;
    currentPage = Math.floor(length / postsPerPage) + 1;

    // Change the current page
    document.getElementById("currentPageAnch").innerText = currentPage;

    // If there is only one page, there are no other pages to navigate to
    if (currentPage === 1) {
        document.getElementById("nextPageBtn").className = "page-item disabled";
        document.getElementById("prevPageBtn").className = "page-item disabled";
    }

    // Redisplay
    showPosts();
    await setOnClicks();
    buildNewPostForm();
    setPostSubmissionClick();
};

// Handles when a post is has its vote score changed (up/down)
async function onPostVote(d) {
    // Update the cached data
    data.posts.forEach((post) => {
        if (post.postid === Number(d.postid)) {
            if (d.increase) post.postvotes++;
            else post.postvotes--;
        }
        if (post.email === d.postowner) {
            if (d.increase) post.uservotes++;
            else post.uservotes--;
        }
    });

    // Redisplay
    showPosts();
    await setOnClicks();
    buildNewPostForm();
    setPostSubmissionClick();
}

// Handles when a new post is sent/received
async function onNewPost (d) {
    data.posts.push({
        email: d.email,
        first: d.first,
        last: d.last,
        postcontent: d.postcontent,
        postdate: d.postdate,
        postid: d.postid,
        posttime: d.posttime,
        postvotes: d.postvotes,
        uservotes: d.postvotes,
    });

    length = data.posts.length;
    maxPages = Math.floor(length / (postsPerPage + 1)) + 1;

    if (maxPages > currentPage) {
        document.getElementById("nextPageBtn").classname = "page-item";
    }

    showPosts();
    await setOnClicks();
    buildNewPostForm();
    setPostSubmissionClick();
}

// Sets the onclick for the post submission form
function setPostSubmissionClick() {
    $('#submitPost').click(function (e) {
        e.preventDefault();

        $.ajax({
            type: 'POST',
            url: '/createPost',
            data: {
                groupID: data.groupInfo[0].groupid,
                boardID: data.boardInfo[0].boardid,
                message: postDraft,
                email: data.email
            },
            success: () => {
                console.log("Post successful");
                document.getElementById("message").value = "";
                postDraft = "";
            },
            error: () => {
                console.log("Post unsuccessful");
            }
        });
    });
}

// Displays posts according to the current page and the posts per page the user wishes to see
function showPosts() {
        // Wipe the inner HTML of the post list - removes all currently displayed posts
        document.getElementById("postList").innerHTML = "";

        // Build the persistent header post [board title & description]
        buildBoardHeader(data.boardInfo[0]);

        // Retrieve which page we're on
        // and how many pages of posts exist
        length = data.posts.length;
        maxPages = Math.floor(length / (postsPerPage + 1)) + 1;

        console.log("maxPages: " + maxPages);
        console.log("currentPage: " + currentPage);
        console.log("data.posts.length: " + length);

        // Find the beginning post index for the current page
        let begin = (currentPage - 1) * postsPerPage;
        let end = begin + (postsPerPage - 1);

        console.log(begin);
        console.log(end);

        // Prevent out-of-bounds errors by using whichever comes sooner
        end = Math.min(end, length - 1);

        // Build the posts
        for (let i = begin; i <= end; i++) {
            buildPost(data.posts[i]);
            //console.log(data.posts[i]);
        }
}

// Sets on click events for the voting and delete buttons
async function setOnClicks() {

    // Find the beginning post index for the current page
    let begin = (currentPage - 1) * postsPerPage;
    let end = begin + (postsPerPage - 1);

    // Prevent out-of-bounds errors by using whichever comes sooner
    end = Math.min(end, length - 1);

    // Iterate through the posts
    for (let i = begin; i <= end; i++) {
        let cubvoteID = "cubvote" + data.posts[i].postid;
        let deleteID = "delete" + data.posts[i].postid;

        let groupID = data.groupInfo[0].groupid;
        let boardID = data.boardInfo[0].boardid;
        let postID = data.posts[i].postid;
        let userID = data.email;

        // Set cubvote click functions
        $('#' + cubvoteID).click(function (e) {
            e.preventDefault();
            $.ajax({
                type: 'POST',
                url: '/cubvotePost',
                data: {
                    groupID: groupID,
                    boardID: boardID,
                    postID: postID,
                    userID: userID
                },
                statusCode: {
                    200: function() {
                        data.post[i].postvotes++;
                        showPosts();
                        setOnClicks();
                        console.log("Post voted successfully!");
                    },
                    201: function() {
                        data.posts[i].postvotes--;
                        showPosts();
                        setOnClicks();
                        console.log("Post unvoted successfully!");
                    },
                    400: function() {
                        console.log("Post voted unsuccessfully!");
                    },
                    403: function() {
                        console.log("The whole thing went wrong");
                    },
                }
            });
            return false;
        });

        // Set delete post functions

        $('#' + deleteID).click(function (e) {
            e.preventDefault();
            $.ajax({
                type: 'POST',
                url: '/deletePost',
                data: {
                    groupID: groupID,
                    boardID: boardID,
                    postID: postID,
                    userID: userID
                },
                statusCode: {
                    200: function(response) {
                        console.log(response);
                        console.log(response.post);
                        alert("Successfully deleted");

                        let loc;

                        // Iterate through the cached data to find the post being deleted
                        // to get the index of that post
                        for (let j = 0; j < data.posts.length; j++) {
                            console.log(data.posts[j].postid);
                            if (data.posts[j].postid === Number(response.post)) {
                                loc = j;
                            }
                        }

                        // Deleting first post
                        if (loc === 0) {
                            data.posts = data.posts.slice(1, data.posts.length);
                        }
                        // Deleting last post
                        else if (loc === data.length - 1) {
                            data.posts = data.posts.slice(0, data.posts.length - 1);
                        }
                        // Deleting middle post
                        else {
                            let part1 = data.posts.slice(0,loc);
                            let part2 = data.posts.slice(loc + 1, data.posts.length);
                            data.posts = part1.concat(part2);
                        }

                        // Update length
                        length = data.posts.length;

                        // Show posts and set on click
                        showPosts();
                        setOnClicks();
                    },
                    500: function() {
                        console.log("Error deleting post! (001)");
                    },
                    401: function() {
                        console.log("Current user cannot delete this post!");
                    }
                },
                error: () => {
                    console.log("Error deleting post! (002)");
                }
            });
        });
    }
}

// Change pages
async function showNext() {
    currentPage++;
    // Enable the previous button
    document.getElementById("prevPageBtn").className = "page-item";

    // Change the current page
    document.getElementById("currentPageAnch").innerText = currentPage;

    // Disable the next button (if on the last page)
    if (currentPage === maxPages) {
        // Disable the button
        document.getElementById("nextPageBtn").className = "page-item disabled";
    }
    showPosts();
    await setOnClicks();
    buildNewPostForm();
    setPostSubmissionClick();
}
async function showPrevious() {
    currentPage--;
    // Enable the next button
    document.getElementById("nextPageBtn").className = "page-item";

    // Change the current page in the current page anchor
    document.getElementById("currentPageAnch").innerText = currentPage;

    // Disable the previous button (if on the first page)
    if (currentPage === 1) {
        // Disable the button
        document.getElementById("prevPageBtn").className = "page-item disabled";
    }
    showPosts();
    await setOnClicks();
    buildNewPostForm();
    setPostSubmissionClick();
}

// Build the card for a given post
function buildPost (post) {
    if (post !== undefined) {
        console.log(post);

        // Give the card an ID so that it can be referenced later (for voting/deleting)
        // Parent card element
        let card = document.createElement("div");
        card.className = "list-group-item";
        card.id = post.postid;

        // The row div within the card
        let row = document.createElement("div");
        row.className = "d-flex";

        // The left column of the row - contains the post's score and the button to vote for that post
        let scoreCol = document.createElement("div");
        scoreCol.className = "flex-column align-self-start justify-content-center";
        scoreCol.style.marginLeft = "1%";
        scoreCol.style.marginRight = "1%";

        // The score itself
        let votes = document.createElement("h5");
        votes.innerText = post.postvotes;
        votes.id = "postvotes" + post.postid;
        votes.style.textAlign = "center";

        // The button to vote for/remove vote from the post
        let reactButton = document.createElement("button");
        reactButton.type = "button";
        reactButton.className = "btn btn-primary btn-sm";
        reactButton.id = "cubvote" + post.postid;

        // The icon within the button
        let reactIcon = document.createElement("i");
        reactIcon.className="bi bi-hand-thumbs-up-fill";
        reactButton.append(reactIcon);

        // Package up scoreCol
        scoreCol.append(votes, reactButton);

        // The content of the post
        let contentOuterDiv = document.createElement("div");
        contentOuterDiv.style.width = "100%";

        let contentInnerDiv = document.createElement("div");
        contentInnerDiv.className = "d-inline-flex w-100 justify-content-between";

        let userInfo = document.createElement("div");
        let userName = document.createElement("span");
        userName.style.fontWeight = "700";
        userName.innerText = post.first + " " + post.last + " - " + post.uservotes;

        let dateString = new Date(Date.parse(post.postdate));
        dateString = dateString.toDateString();

        let postTimestamp = document.createElement("small");
        postTimestamp.innerText = dateString + " - " + post.posttime;

        let postContent = document.createElement("p");
        postContent.innerText = post.postcontent;

        // Package up the post content
        userInfo.append(userName);
        contentInnerDiv.append(userInfo, postTimestamp);
        contentOuterDiv.append(contentInnerDiv, postContent);

        // Append to the row
        row.append(scoreCol, contentOuterDiv);
        card.append(row);

        // Delete button
        let deleteContainer = document.createElement("div");
        deleteContainer.style.height = "100%";
        deleteContainer.style.marginLeft = "1%";
        deleteContainer.className = "flex-column align-items-center justify-content-center";

        let deleteButton = document.createElement("button");
        deleteButton.type = "button";
        deleteButton.className = "btn btn-danger btn-sm";

        let delIcon = document.createElement("i");
        delIcon.className="bi bi-trash-fill";

        // If the delete button is meant to be visible for the current user,
        // Wire up the postid and make it visible
        // We still append the button to the card regardless so that spacing
        // is consistent
        if (data.groupInfo[0].leader === data.email || post.email === data.email) {
            deleteButton.id = "delete" + post.postid;
            deleteButton.style.visibility = "visible";
        } else {deleteButton.style.visibility = "hidden";}

        deleteButton.append(delIcon);
        deleteContainer.append(deleteButton);
        row.append(deleteContainer);

        document.getElementById("postList").appendChild(card);
    }
}
// Build the header for the board
function buildBoardHeader (board) {

    // Anchor that holds the card
    let boardAnchor = document.createElement("div");
    boardAnchor.className = "list-group-item";

    // Card that holds the info
    let boardCard = document.createElement("div");
    boardCard.className = "d-flex justify-content-between";

    // First child of the card - the board's name
    let boardName = document.createElement("h5")
    boardName.innerText = board.boardname;

    // Second child of the card - the board's description
    let boardDesc = document.createElement("span");
    boardDesc.className = "mb-1";
    boardDesc.innerText = board.boarddesc;

    // Put it all together
    boardAnchor.appendChild(boardName);
    boardAnchor.appendChild(boardDesc);

    document.getElementById("postList").appendChild(boardAnchor);
}
// Build the input form to submit a post (below the posts)
function buildNewPostForm() {
    // Anchor that holds the card
    let boardAnchor = document.createElement("div");
    boardAnchor.className = "list-group-item";
    // Card that holds the info
    let boardCard = document.createElement("div");
    boardCard.className = "d-flex justify-content-end";

    // Form that holds the input fields
    let postForm = document.createElement("form");
    postForm.id = "postForm";
    //postForm.action = "/groupPage/" + data.groupInfo[0].groupid;
    postForm.action = "/createPost";
    postForm.method = "post";
    postForm.style.width = "100%";

    // Form input fields
    //   Post content
    let postInput = document.createElement("input");
    postInput.name = "message";
    postInput.id = "message";
    postInput.className = "form-control";
    postInput.placeholder = "Enter post text here";
    postInput.style.width = "100%";
    postInput.style.height = "100px";
    postInput.value = postDraft;
    postInput.oninput = () => {
        postDraft = document.getElementById("message").value;
    }

    //   Email
    let emailInput = document.createElement("input");
    emailInput.name = "email";
    emailInput.value = data.email;
    emailInput.style.visibility = "collapse";
    emailInput.style.display = "none";
    //   BoardID
    let boardIDInput = document.createElement("input");
    boardIDInput.name = "boardID";
    boardIDInput.value = data.boardInfo[0].boardid;
    boardIDInput.style.visibility = "collapse";
    boardIDInput.style.display = "none";
    //   GroupID
    let groupIDInput = document.createElement("input");
    groupIDInput.name = "groupID";
    groupIDInput.value = data.groupInfo[0].groupid;
    groupIDInput.setAttribute("visibility", "collapse");
    groupIDInput.style.visibility = "collapse";
    groupIDInput.style.display = "none";

    // Label
    let postLabel = document.createElement("div");
    postLabel.className = "d-flex align-items-center align-self-center align-content-between"
    //postLabel.innerText = "Submit a new post";
    postLabel.style.width = "100%";

    // Button
    let submitButton = document.createElement("button");
    submitButton.id = "submitPost";
    submitButton.className = "btn btn-primary";
    submitButton.innerText = "Submit";
    submitButton.style.marginLeft = "10px";
    submitButton.style.marginRight = "-10px";

    postLabel.appendChild(postInput);
    postLabel.appendChild(submitButton);
    postForm.appendChild(postLabel);
    postForm.appendChild(emailInput);
    postForm.appendChild(boardIDInput);
    postForm.appendChild(groupIDInput);

    boardCard.appendChild(postForm);
    boardAnchor.appendChild(boardCard);


    document.getElementById("postList").appendChild(boardAnchor);
}