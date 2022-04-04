//jshint esversion:6

// ######################################################
// #            SERVER & DB SETUP BELOW                 #
// ######################################################

const { Client } = require('pg');
const client = new Client({
  user: 'dststgay',
  host: 'raja.db.elephantsql.com',
  database: 'dststgay',
  password: '5x7CA-QTDfAFlCNQHGfDRdBox2RC0EOd',
  port: 5432,
});

client.connect();
const express = require("express");
const bodyParser = require("body-parser");
//const session = require("express-session");
const router = require("express-promise-router")();
const app = express();
const server = require('http').Server(app);
const io = require("socket.io")(server);
const uid = require('uid-safe');

app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({extended: true}));
app.use(express.static(__dirname + "/public/"));
app.use(router);
const ejs = require("ejs");
const Console = require("console");

// Add server port
let port = process.env.PORT;
if (port == null || port === "") {
  port = 3000;
}
server.listen(port, function() {
  console.log("Server has started on port 3000");
});

io.on('connection', (socket) => {
  console.log(socket.handshake.headers.referer);
  console.log("Successfully connected, userID = " + socket.id + " to socket server");
  let data = socket.handshake.headers.referer.split("/");
  // console.log("Data length: " + data.length);

  // On the group home page
  if (data[data.length - 2] === "groupPage") {
    console.log("Joining room: " + data[data.length-1]);
    socket.join(data[data.length-1]);
  }
  // On the group board page
  else if (data[data.length - 2] === "groupBoardPage") {
    let groupID = data[data.length - 3];
    let boardID = data[data.length - 1];
    console.log(groupID);
    console.log(boardID);
    console.log("User has joined room: " + groupID + "/" + boardID);
    socket.join(groupID+ "/" + boardID);
  }
});

// ######################################################
// #              SERVER ROUTES BELOW                   #
// ######################################################

// LOGIN/REGISTER ROUTES
//   Display login page
router.get("/", (req, res) => {
  let login_reg_status = {
    status: "fine"
  };
  res.render("login");
  //res.render("login", {status: JSON.stringify(login_reg_status)});
});
//   User login
router.post("/login", async (req, res) => {
  await login(req, res);
});
//   User registration
router.post("/register", async (req, res) => {
  await register(req, res);
});

// USER HOME PAGE ROUTE
// Show the user home page
router.get("/home", async (req, res) => {
  // Parse the cookies
  const cookies = cookieParser(req);

  // Assume the given user is not valid to begin with
  let authResult = false;

  // Set up the query
  const values = [cookies["email"], cookies["session"], req.ip];
  console.log("Authenticating -- Email: " + values[0] + " sid: " + values[1] + " IP: " + values[2]);
  let query = "SELECT * FROM session where email = $1 AND id = $2 AND ip = $3";

  // Check to see if the given values exist in the session table
  client.query(query, values, (err, response) => {
    if (err) {
      printError(err, "Unable to query when authenticating " + cookies["email"]);
      authResult = false;
    } else {
      if (response.rows.length !== 0) {
        const date = new Date();
        authResult = date.toISOString() <= String(response.rows[0].expires);
        console.log("Setting auth result to: " + authResult);
      }
      // If authResult is still false -> Invalidate session and send to login
      if (!authResult) {
        res.clearCookie("email");
        res.clearCookie("session");
        res.status(401).redirect("/");
      } else {
        let query = "SELECT * FROM users WHERE email = $1";
        const values = [cookies["email"]];
        let user, events, groups;

        // getting the user's information
        client.query(query, values, (err, response) => {
          if (err) printError(err, "1");
          else {
            console.log(response.rows);

            user = response.rows[0];

            // getting the groups they are a part of
            query = "WITH groupsInvited AS (SELECT * FROM member_ WHERE email = $1 and status = true) " +
                "SELECT * FROM group_ JOIN groupsInvited ON group_.groupid = groupsInvited.groupid"
            client.query(query, values, (err, response) => {
              if (err) printError(err, "2");
              else {
                groups = response.rows;

                // getting the events they are a part of
                query = "WITH events AS (SELECT * FROM attend WHERE email = $1 and attending = true) " +
                    "SELECT * FROM event natural join events";
                client.query(query, values, (err, response) => {
                  if (err) printError(err, "3");
                  else {
                    events = response.rows;
                    const obj = {
                      user: user,
                      groups: groups,
                      events: events
                    }
                    //console.log(obj);
                    res.render("homepage", {sObj: JSON.stringify(obj), obj: obj, email: cookies["email"]});
                  }
                });
              }
            });
          }
        });
      }
    }
  });
});

// TODO - remove? duplicate of /creategroup?
// Create group post request
router.post("/group", async (req, res) => {
  // Parse the cookies
  const cookies = cookieParser(req);

  // Assume the given user is not valid to begin with
  let authResult = false;

  // Set up the query
  const values = [cookies["email"], cookies["session"], req.ip];
  console.log("Authenticating -- Email: " + values[0] + " sid: " + values[1] + " IP: " + values[2]);
  let query = "SELECT * FROM session where email = $1 AND id = $2 AND ip = $3";

  // Check to see if the given values exist in the session table
  client.query(query, values, async (err, response) => {
    if (err) {
      printError(err, "Unable to query when authenticating " + cookies["email"]);
      authResult = false;
    } else {
      if (response.rows.length !== 0) {
        const date = new Date();
        authResult = date.toISOString() <= String(response.rows[0].expires);
        console.log("Setting auth result to: " + authResult);
      }
      // If authResult is still false -> Invalidate session and send to login
      if (!authResult) {
        res.clearCookie("email");
        res.clearCookie("session");
        res.status(401).redirect("/");
      } else {
        let leader = cookies["email"];
        let desc = req.body.groupDesc;
        let name = req.body.groupName;
        let isPrivate = (req.body.btnradio === "true");
        let tag = req.body.tag;
        let pic = req.body.grouppic;

        await createGroup(leader, name, desc, isPrivate, tag, pic, res);
      }
    }
  });
});

// JOIN GROUP PAGE ROUTES
//    Show the groups a user can join
router.get("/groupMenuPage", async (req, res) => {
  // Parse the cookies
  const cookies = cookieParser(req);

  // Assume the given user is not valid to begin with
  let authResult = false;

  // Set up the query
  const values = [cookies["email"], cookies["session"], req.ip];
  console.log("Authenticating -- Email: " + values[0] + " sid: " + values[1] + " IP: " + values[2]);
  let query = "SELECT * FROM session where email = $1 AND id = $2 AND ip = $3";

  // Check to see if the given values exist in the session table
  client.query(query, values, (err, response) => {
    if (err) {
      printError(err, "Unable to query when authenticating " + cookies["email"]);
      authResult = false;
    } else {
      if (response.rows.length !== 0) {
        const date = new Date();
        authResult = date.toISOString() <= String(response.rows[0].expires);
        console.log("Setting auth result to: " + authResult);
      }
      // If authResult is still false -> Invalidate session and send to login
      if (!authResult) {
        res.clearCookie("email");
        res.clearCookie("session");
        res.status(401).redirect("/");
      } else {
        const query = "SELECT group_.groupid, group_.groupname, group_.groupdesc, group_.tagname as categorytag, users.first, users.last "
                    + "FROM group_ JOIN users ON group_.leader = users.email "
                    + "WHERE private = false; ";

        client.query(query, [], (err, response) => {
          if (err){
            printError(err, "Error retrieving group info (001)");
            res.status(503).send("Error retrieving group info (001)");
          }
          else {
            let groupInfo = response.rows;
            const query = "SELECT * "
                        + "FROM grouptags ";

            client.query(query, [], (err, response) => {
              if (err) {
                printError(err, "Error retrieving group tags (002)");
                res.status(503).send("Error retrieving group tags (002)");
              }
              else {
                // let grouptags = new Map();
                let grouptags = [];
                response.rows.forEach((row) => {
                  if (grouptags[row.groupid] === undefined) {
                    grouptags[row.groupid] = [];
                  }
                  grouptags[row.groupid].push(row.tagname);
                });

                groupInfo.forEach((group) => {
                  group.tags = grouptags[group.groupid];
                });

                res.render("groupMenuPage", {groups: groupInfo, data: JSON.stringify(groupInfo)});
              }
            });
          }
        });
      }
    }
  });
});


// TODO - fix join group await
//    Join a group and enter their page
router.post("/groupMenuPage", async (req, res) => {
  // Parse the cookies
  const cookies = cookieParser(req);

  // Assume the given user is not valid to begin with
  let authResult = false;

  // Set up the query
  const values = [cookies["email"], cookies["session"], req.ip];
  console.log("Authenticating -- Email: " + values[0] + " sid: " + values[1] + " IP: " + values[2]);
  let query = "SELECT * FROM session where email = $1 AND id = $2 AND ip = $3";

  // Check to see if the given values exist in the session table
  client.query(query, values, async (err, response) => {
    if (err) {
      printError(err, "Unable to query when authenticating " + cookies["email"]);
      authResult = false;
    } else {
      if (response.rows.length !== 0) {
        const date = new Date();
        authResult = date.toISOString() <= String(response.rows[0].expires);
        console.log("Setting auth result to: " + authResult);
      }
      // If authResult is still false -> Invalidate session and send to login
      if (!authResult) {
        res.clearCookie("email");
        res.clearCookie("session");
        res.status(401).redirect("/");
      } else {
        // let groupID = req.params["groupID"];
        let groupID = req.body.groupID;
        console.log("Attempting to join: " + groupID);
        await joinGroup(cookies["email"], groupID, res);
      }
    }
  });
});

// TODO - fix create group await
// Create a group
router.post("/createGroup", (req, res) => {
  // Parse the cookies
  const cookies = cookieParser(req);

  // Assume the given user is not valid to begin with
  let authResult = false;

  // Set up the query
  const values = [cookies["email"], cookies["session"], req.ip];
  console.log("Authenticating -- Email: " + values[0] + " sid: " + values[1] + " IP: " + values[2]);
  let query = "SELECT * FROM session where email = $1 AND id = $2 AND ip = $3";

  // Check to see if the given values exist in the session table
  client.query(query, values, async (err, response) => {
    if (err) {
      printError(err, "Unable to query when authenticating " + cookies["email"]);
      authResult = false;
    } else {
      if (response.rows.length !== 0) {
        const date = new Date();
        authResult = date.toISOString() <= String(response.rows[0].expires);
        console.log("Setting auth result to: " + authResult);
      }
      // If authResult is still false -> Invalidate session and send to login
      if (!authResult) {
        res.clearCookie("email");
        res.clearCookie("session");
        res.status(401).redirect("/");
      } else {
        await createGroup(cookies["email"], req.body.groupName, req.body.groupDesc, (req.body.btnradio === "true"), req.body.tag, req.body.grouppic, res);
      }
    }
  });
});

//  Display the group page
router.get("/groupPage/:groupID", (req, res) => {
// Parse the cookies
  const cookies = cookieParser(req);

// Assume the given user is not valid to begin with
  let authResult = false;

// Set up the query
  const values = [cookies["email"], cookies["session"], req.ip];
  console.log("Authenticating -- Email: " + values[0] + " sid: " + values[1] + " IP: " + values[2]);
  let query = "SELECT * FROM session where email = $1 AND id = $2 AND ip = $3";

// Check to see if the given values exist in the session table
  client.query(query, values, (err, response) => {
    if (err) {
      printError(err, "Unable to query when authenticating " + cookies["email"]);
      authResult = false;
    } else {
      console.log("Finished auth query");
      if (response.rows.length !== 0) {
        const date = new Date();
        authResult = date.toISOString() <= String(response.rows[0].expires);
        console.log("Setting auth result to: " + authResult);
      } else {
        console.log("Auth query returned no results");
      }
      // If authResult is still false -> Invalidate session and send to login
      if (!authResult) {
        res.clearCookie("email");
        res.clearCookie("session");
        res.status(401).redirect("/");
      } else {
        // Variable declarations
        let groupInfo, events, boards, tags;

        // Determine if the user is in the group
        const query = "SELECT * from member_ WHERE email = $1 AND groupid = $2 AND banned = false";
        const values = [cookies["email"], req.params["groupID"]];

        client.query(query, values, (err, response) => {
          console.log("Finished member query");
          if (err) {
            // Error determining if user is a member
            printError(err, "Error determining if user is a member");
            res.status(503);
          } else {
            if (response.rows.length === 0) {
              // User is not in the group
              res.status(401).redirect("/home");
            } else {
              // User is in the group

              // Fetch group info
              const query = "SELECT * FROM group_ WHERE groupid = $1";
              const values = [req.params["groupID"]];
              client.query(query, values, (err, response) => {
                console.log("Finished group query");
                if (err) printError(err, "Error retrieving group info (001)")
                else {
                  groupInfo = response.rows[0];

                  // Fetch events
                  const query2 = "SELECT * FROM event WHERE groupid = $1";
                  console.log("Finished event query");
                  client.query(query2, values, (err, response) => {
                    if (err) printError(err, "Error retrieving events (002)")
                    else {
                      events = response.rows;

                      // Fetch boards
                      const query3 = "SELECT * from board natural join boardlist WHERE groupid = $1"
                      client.query(query3, values, (err, response) => {
                        console.log("Finished board query");
                        if (err) printError(err, "Error retrieving boards (003)")
                        else {
                          boards = response.rows;

                          // Fetch group tags
                          const query4 = "SELECT tagname FROM grouptags WHERE groupid = $1"
                          client.query(query4, values, (err, response) => {
                            if (err) console.log(err.stack);
                            else {
                              tags = response.rows;
                              let group =
                                  {
                                    email: cookies["email"],
                                    group: groupInfo,
                                    events: events,
                                    boards: boards,
                                    tags: tags
                                  };

                              // Send the data back as a JSON
                              res.status(200).render("groupHomePage", {group: JSON.stringify(group)});
                            }
                          });
                        }
                      });
                    }
                  });
                }
              });
            }
          }
        });
      }
    }
  });
});

//  Create a post
router.post("/createPost", async (req, res) => {
  // Parse the cookies
  const cookies = cookieParser(req);

  // Assume the given user is not valid to begin with
  let authResult = false;

  // Set up the query
  const values = [cookies["email"], cookies["session"], req.ip];
  console.log("Authenticating -- Email: " + values[0] + " sid: " + values[1] + " IP: " + values[2]);
  let query = "SELECT * FROM session where email = $1 AND id = $2 AND ip = $3";

  // Check to see if the given values exist in the session table
  client.query(query, values, (err, response) => {
    if (err) {
      printError(err, "Unable to query when authenticating " + cookies["email"]);
      authResult = false;
    } else {
      if (response.rows.length !== 0) {
        const date = new Date();
        authResult = date.toISOString() <= String(response.rows[0].expires);
        console.log("Setting auth result to: " + authResult);
      }
      // If authResult is still false -> Invalidate session and send to login
      if (!authResult) {
        res.clearCookie("email");
        res.clearCookie("session");
        res.status(401).redirect("/");
      } else {
        createPost(req, res);
      }
    }
  });
});

//  Delete a post
router.post("/deletePost", async (req, res) => {
  // Parse the cookies
  const cookies = cookieParser(req);

  // Assume the given user is not valid to begin with
  let authResult = false;

  // Set up the query
  const values = [cookies["email"], cookies["session"], req.ip];
  console.log("Authenticating -- Email: " + values[0] + " sid: " + values[1] + " IP: " + values[2]);
  let query = "SELECT * FROM session where email = $1 AND id = $2 AND ip = $3";

  // Check to see if the given values exist in the session table
  client.query(query, values, (err, response) => {
    if (err) {
      printError(err, "Unable to query when authenticating " + cookies["email"]);
      authResult = false;
    } else {
      if (response.rows.length !== 0) {
        const date = new Date();
        authResult = date.toISOString() <= String(response.rows[0].expires);
        console.log("Setting auth result to: " + authResult);
      }
      // If authResult is still false -> Invalidate session and send to login
      if (!authResult) {
        res.clearCookie("email");
        res.clearCookie("session");
        res.status(401).redirect("/");
      } else {
        // Verify the user matches
        if (req.body.userID === cookies["email"]) {
          deletePost(req, res);
        } else res.status(401);
      }
    }
  });
});

router.get("/groupBoardPage/:groupID/:boardID", async (req, res) => {
  // Parse the cookies
  const cookies = cookieParser(req);

  // Assume the given user is not valid to begin with
  let authResult = false;

  // Set up the query
  const values = [cookies["email"], cookies["session"], req.ip];
  console.log("Authenticating -- Email: " + values[0] + " sid: " + values[1] + " IP: " + values[2]);
  let query = "SELECT * FROM session where email = $1 AND id = $2 AND ip = $3";

  // Check to see if the given values exist in the session table
  client.query(query, values, (err, response) => {
    if (err) {
      printError(err, "Unable to query when authenticating " + cookies["email"]);
      authResult = false;
    } else {
      if (response.rows.length !== 0) {
        const date = new Date();
        authResult = date.toISOString() <= String(response.rows[0].expires);
        console.log("Setting auth result to: " + authResult);
      }
      // If authResult is still false -> Invalidate session and send to login
      if (!authResult) {
        res.clearCookie("email");
        res.clearCookie("session");
        res.status(401).redirect("/");
      } else {
        res.redirect("/groupPage/" + req.params["groupID"] + "/groupBoardPage/" + req.params["boardID"]);
      }
    }
  });
});

// get request for displaying board and posts page
router.get("/groupPage/:groupID/groupBoardPage/:boardID", async (req, res) => {
  // Parse the cookies
  const cookies = cookieParser(req);

  // Assume the given user is not valid to begin with
  let authResult = false;

  // Set up the query
  const values = [cookies["email"], cookies["session"], req.ip];
  console.log("Authenticating -- Email: " + values[0] + " sid: " + values[1] + " IP: " + values[2]);
  let query = "SELECT * FROM session where email = $1 AND id = $2 AND ip = $3";

  // Check to see if the given values exist in the session table
  client.query(query, values, (err, response) => {
    if (err) {
      printError(err, "Unable to query when authenticating " + cookies["email"]);
      authResult = false;
    } else {
      if (response.rows.length !== 0) {
        const date = new Date();
        authResult = date.toISOString() <= String(response.rows[0].expires);
        console.log("Setting auth result to: " + authResult);
      }
      // If authResult is still false -> Invalidate session and send to login
      if (!authResult) {
        res.clearCookie("email");
        res.clearCookie("session");
        res.status(401).redirect("/");
      } else {
        displayBoard(req, res, req.params["boardID"], req.params["groupID"], cookies["email"]);
      }
    }
  });
});

// Create a new board
router.post("/addBoard", async (req, res) => {
  // Parse the cookies
  const cookies = cookieParser(req);

  // Assume the given user is not valid to begin with
  let authResult = false;

  // Set up the query
  const values = [cookies["email"], cookies["session"], req.ip];
  console.log("Authenticating -- Email: " + values[0] + " sid: " + values[1] + " IP: " + values[2]);
  let query = "SELECT * FROM session where email = $1 AND id = $2 AND ip = $3";

  // Check to see if the given values exist in the session table
  client.query(query, values, (err, response) => {
    if (err) {
      printError(err, "Unable to query when authenticating " + cookies["email"]);
      authResult = false;
    } else {
      if (response.rows.length !== 0) {
        const date = new Date();
        authResult = date.toISOString() <= String(response.rows[0].expires);
        console.log("Setting auth result to: " + authResult);
      }
      // If authResult is still false -> Invalidate session and send to login
      if (!authResult) {
        res.clearCookie("email");
        res.clearCookie("session");
        res.status(401).redirect("/");
      } else {
        createBoard(req, res);
      }
    }
  });
});

// Delete a board
router.post("/deleteBoard", async (req, res) => {
  // Parse the cookies
  const cookies = cookieParser(req);

// Assume the given user is not valid to begin with
  let authResult = false;

// Set up the query
  const values = [cookies["email"], cookies["session"], req.ip];
  console.log("Authenticating -- Email: " + values[0] + " sid: " + values[1] + " IP: " + values[2]);
  let query = "SELECT * FROM session where email = $1 AND id = $2 AND ip = $3";

// Check to see if the given values exist in the session table
  client.query(query, values, (err, response) => {
    if (err) {
      printError(err, "Unable to query when authenticating " + cookies["email"]);
      authResult = false;
    } else {
      if (response.rows.length !== 0) {
        const date = new Date();
        authResult = date.toISOString() <= String(response.rows[0].expires);
        console.log("Setting auth result to: " + authResult);
      }
      // If authResult is still false -> Invalidate session and send to login
      if (!authResult) {
        res.clearCookie("email");
        res.clearCookie("session");
        res.status(401).redirect("/");
      } else {
        let groupID = req.body.groupID;
        let boardID = req.body.boardID;

        deleteBoard(groupID, boardID, cookies["email"], res);
      }
    }
  });
});

// TODO - Doesn't make sense? Is this a user accepting a group invite? Figure out those two mystery lines
//post request handling for giving a user a group invite
router.post("/groupInviteUser", async (req, res) => {
  // Parse the cookies
  const cookies = cookieParser(req);

// Assume the given user is not valid to begin with
  let authResult = false;

// Set up the query
  const values = [cookies["email"], cookies["session"], req.ip];
  console.log("Authenticating -- Email: " + values[0] + " sid: " + values[1] + " IP: " + values[2]);
  let query = "SELECT * FROM session where email = $1 AND id = $2 AND ip = $3";

// Check to see if the given values exist in the session table
  client.query(query, values, (err, response) => {
    if (err) {
      printError(err, "Unable to query when authenticating " + cookies["email"]);
      authResult = false;
    } else {
      if (response.rows.length !== 0) {
        const date = new Date();
        authResult = date.toISOString() <= String(response.rows[0].expires);
        console.log("Setting auth result to: " + authResult);
      }
      // If authResult is still false -> Invalidate session and send to login
      if (!authResult) {
        res.clearCookie("email");
        res.clearCookie("session");
        res.status(401).redirect("/");
      } else {
        let userEmail = req.body.userEmail;
        let inviteEmail = req.body.inviteEmail;
        let groupID = req.body.groupID;
        if (cookies["email"] !== userEmail) {
          res.status(401);
        } else {
          groupInviteUser(req, res, cookies["email"], req.body.inviteEmail, req.body.groupID);
          // What do these two lines do?
          // req.body.userEmail = userEmail;
          // req.body.inviteEmail = inviteEmail;
          // res.redirect("/groupPage/" + groupID);
        }
      }
    }
  });
});

// TODO - Figure out those two mystery lines
//  get request handling for returning a notification for a group invite for a user
/*router.get("/groupPage/:groupID", async (req, res) => {
// Parse the cookies
  const cookies = cookieParser(req);

// Assume the given user is not valid to begin with
  let authResult = false;

// Set up the query
  const values = [cookies["email"], cookies["session"], req.ip];
  console.log("Authenticating -- Email: " + values[0] + " sid: " + values[1] + " IP: " + values[2]);
  let query = "SELECT * FROM session where email = $1 AND id = $2 AND ip = $3";

// Check to see if the given values exist in the session table
  client.query(query, values, (err, response) => {
    if (err) {
      printError(err, "Unable to query when authenticating " + cookies["email"]);
      authResult = false;
    } else {
      if (response.rows.length !== 0) {
        const date = new Date();
        authResult = date.toISOString() <= String(response.rows[0].expires);
        console.log("Setting auth result to: " + authResult);
      }
      // If authResult is still false -> Invalidate session and send to login
      if (!authResult) {
        res.clearCookie("email");
        res.clearCookie("session");
        res.status(401).redirect("/");
      } else {
        if (req.body.userEmail !== cookies["email"]) {
          console.log("User email mismatch. Inviting forbidden.");
          req.status(401);
        } else {
          groupInviteUser(req, res, cookies["email"], req.body.inviteEmail, req.params["groupID"]);
          // I don't know why these are here???
          req.body.userEmail = null;
          req.body.inviteEmail = null;
        }
      }
    }
  });
});*/

// Add or remove a vote for a post
router.post("/cubvotePost", async (req, res) => {
  // Parse the cookies
  const cookies = cookieParser(req);

  // Assume the given user is not valid to begin with
  let authResult = false;

  // Set up the query
  const values = [cookies["email"], cookies["session"], req.ip];
  console.log("Authenticating -- Email: " + values[0] + " sid: " + values[1] + " IP: " + values[2]);
  let query = "SELECT * FROM session where email = $1 AND id = $2 AND ip = $3";

  // Check to see if the given values exist in the session table
  client.query(query, values, (err, response) => {
    if (err) {
      printError(err, "Unable to query when authenticating " + cookies["email"]);
      authResult = false;
    } else {
      if (response.rows.length !== 0) {
        const date = new Date();
        authResult = date.toISOString() <= String(response.rows[0].expires);
        console.log("Setting auth result to: " + authResult);
      }
      // If authResult is still false -> Invalidate session and send to login
      if (!authResult) {
        res.clearCookie("email");
        res.clearCookie("session");
        res.status(401).redirect("/");
      } else {
        // Add/remove the vote to the post
        changePostVote(req, res);
      }
    }
  });
});

// Invite a user to an event
router.post("/eventInviteUser", async (req, res) => {
  // Parse the cookies
  const cookies = cookieParser(req);

  // Assume the given user is not valid to begin with
  let authResult = false;

  // Set up the query
  const values = [cookies["email"], cookies["session"], req.ip];
  console.log("Authenticating -- Email: " + values[0] + " sid: " + values[1] + " IP: " + values[2]);
  let query = "SELECT * FROM session where email = $1 AND id = $2 AND ip = $3";

  // Check to see if the given values exist in the session table
  client.query(query, values, (err, response) => {
    if (err) {
      printError(err, "Unable to query when authenticating " + cookies["email"]);
      authResult = false;
    } else {
      if (response.rows.length !== 0) {
        const date = new Date();
        authResult = date.toISOString() <= String(response.rows[0].expires);
        console.log("Setting auth result to: " + authResult);
      }
      // If authResult is still false -> Invalidate session and send to login
      if (!authResult) {
        res.clearCookie("email");
        res.clearCookie("session");
        res.status(401).redirect("/");
      } else {
        const query = "INSERT INTO attend (email, eventid, attending) VALUES($1, $2, $3);"
        client.query(query, [cookies["email"], req.body.eventID, false], (err, response) => {
          if (err) printError(err, "Error inviting user to event");
          else res.redirect("/eventHomePage/" + req.body.eventID);
        });
      }
    }
  });
});

// Create an event
router.post("/createEvent", async (req, res) => {
  // Parse the cookies
  const cookies = cookieParser(req);
  console.log("GROUP ID: " + req.body.groupID);

  // Assume the given user is not valid to begin with
  let authResult = false;

  // Set up the query
  const values = [cookies["email"], cookies["session"], req.ip];
  console.log("Authenticating -- Email: " + values[0] + " sid: " + values[1] + " IP: " + values[2]);
  let query = "SELECT * FROM session where email = $1 AND id = $2 AND ip = $3";

  // Check to see if the given values exist in the session table
  client.query(query, values, (err, response) => {
    if (err) {
      printError(err, "Unable to query when authenticating " + cookies["email"]);
      authResult = false;
    } else {
      if (response.rows.length !== 0) {
        const date = new Date();
        authResult = date.toISOString() <= String(response.rows[0].expires);
        console.log("Setting auth result to: " + authResult);
      }
      // If authResult is still false -> Invalidate session and send to login
      if (!authResult) {
        res.clearCookie("email");
        res.clearCookie("session");
        res.status(401).redirect("/");
      } else {
        createEvent(cookies["email"], req.body.eventName, req.body.eventDesc, req.body.datetimes, req.body.groupID, res);
      }
    }
  });
});

// Display event
router.get("/eventHomePage/:eventID", async (req, res) => {
  // Parse the cookies
  const cookies = cookieParser(req);

  // Assume the given user is not valid to begin with
  let authResult = false;

  // Set up the query
  const values = [cookies["email"], cookies["session"], req.ip];
  console.log("Authenticating -- Email: " + values[0] + " sid: " + values[1] + " IP: " + values[2]);
  let query = "SELECT * FROM session where email = $1 AND id = $2 AND ip = $3";

  // Check to see if the given values exist in the session table
  client.query(query, values, (err, response) => {
    if (err) {
      printError(err, "Unable to query when authenticating " + cookies["email"]);
      authResult = false;
    } else {
      if (response.rows.length !== 0) {
        const date = new Date();
        authResult = date.toISOString() <= String(response.rows[0].expires);
        console.log("Setting auth result to: " + authResult);
      }
      // If authResult is still false -> Invalidate session and send to login
      if (!authResult) {
        res.clearCookie("email");
        res.clearCookie("session");
        res.status(401).redirect("/");
      } else {
        // Variable declarations
        let event, attendees, host, notInvited;

        // Get the event & host info
        const query = "SELECT eventid, eventname, eventdesc, starttime, endtime, startdate, enddate, host,"
            + "groupid, startunix, endunix, first, last, bio FROM event join users "
            + "ON event.host = users.email WHERE eventid = $1";
        client.query(query, [req.params["eventID"]], (err, response) => {
          if (err) printError(err, "Error retrieving event info")
          else {
            event = response.rows[0];
            host = {
              email: event.host,
              first: event.first,
              last: event.last,
              bio: event.bio,
              cubvotes: 0
            };

            // Get the host's score
            const query = "SELECT COUNT(*) AS cubvotes "
                + "FROM cubvoted natural join post "
                + "WHERE postowner = $1";
            client.query(query, [host.email], (err, response) => {
              if (err) printError(err, "Error getting host score")
              else if (response.rows.length !== 0) {
                host.cubvotes = response.rows[0].cubvotes;
                // get the attendees
                // get the event info and the list of attendees, both accepted and non accepted
                const query = "WITH attendees AS ("
                    + "SELECT email FROM attend WHERE eventid = $1), "
                    + "scores AS ("
                    + "SELECT postowner as email, COUNT(*) AS cubvotes "
                    + "FROM cubvoted natural join post "
                    + "GROUP BY postowner)"
                    + "SELECT first, last, bio, cubvotes "
                    + "FROM users natural join attendees natural join scores";
                client.query(query, [req.params["eventID"]], (err, response) => {
                  if (err) printError(err, "Error retrieving attendees")
                  else {
                    attendees = response.rows;

                    // get the list of people not invited, who belong to the group, in order to invite them
                    const query = "SELECT email FROM member_ where groupid = $1 " +
                        "EXCEPT " +
                        "SELECT email from attend where eventid = $2"
                    client.query(query, [event.groupid, req.params["eventID"]], (err, response) => {
                      if (err) console.log(err.stack);
                      else {
                        notInvited = response.rows;

                        // assemble the object
                        const obj = {
                          event: event,
                          attendees: attendees,
                          host: host,
                          notInvited: notInvited
                        }
                        console.log(JSON.stringify(obj));
                        res.render("eventHomePage", {obj: obj});
                      }
                    });
                  }
                });
              }
            });
          }
        });
      }
    }
  });
});

// Allows the leader to add a tag to a group
router.post("/addGroupTag", async (req, res) => {
  // Parse the cookies
  const cookies = cookieParser(req);

  // Assume the given user is not valid to begin with
  let authResult = false;

  // Set up the query
  const values = [cookies["email"], cookies["session"], req.ip];
  console.log("Authenticating -- Email: " + values[0] + " sid: " + values[1] + " IP: " + values[2]);
  let query = "SELECT * FROM session where email = $1 AND id = $2 AND ip = $3";

  // Check to see if the given values exist in the session table
  client.query(query, values, (err, response) => {
    if (err) {
      printError(err, "Unable to query when authenticating " + cookies["email"]);
      authResult = false;
    } else {
      if (response.rows.length !== 0) {
        const date = new Date();
        authResult = date.toISOString() <= String(response.rows[0].expires);
        console.log("Setting auth result to: " + authResult);
      }
      // If authResult is still false -> Invalidate session and send to login
      if (!authResult) {
        res.clearCookie("email");
        res.clearCookie("session");
        res.status(401).redirect("/");
      } else {
        const query = "SELECT leader FROM group_ WHERE groupid = $1";
        client.query(query, [req.body.groupID], async (err, response) => {
          if (err) {
            printError(err, "Error validating leader (001)");
            res.status(403);
          }
          if (response.rows.length !== 0) {
            if (response.rows[0].leader === cookies["email"]) {
              console.log("User is leader");
              // The current user is authenticated and the leader of the group
              if (req.body.tagname.toLowerCase() === "group" ||
                  req.body.tagname.toLowerCase() === "extracurricular" ||
                  req.body.tagname.toLowerCase() === "other") {
                console.log("Cannot add a category tag! (002)");
                res.status(400);
              } else {
                console.log("Valid tag");
                const query = "SELECT * FROM grouptags WHERE groupid = $1";
                client.query(query, [req.body.groupID], (err, response) => {
                  if (err) {
                    printError(err, "Error retrieving group tags (003)");
                  } else {
                    console.log("Tags retrieved");
                    // If the group hasn't hit the tag limit
                    if (response.rows.length < 5) {
                      console.log("Under tag capacity!");
                      const query = "INSERT INTO grouptags VALUES ($1, $2);"
                      client.query(query, [req.body.groupID, req.body.tagname], (err, response) => {
                        if (err) {
                          printError(err, "Error inserting tag (004)");
                          res.status(503);
                        }
                        else {
                          console.log("Tag created!");
                          res.status(201).json({});
                        }
                      });
                    }
                    res.status(400);
                  }
                });
              }
            } else {
              res.status(403);
            }
          } else {
            console.log("Cannot find leader!")
            res.status(404);
          }
        });
      }
    }
  });
});

router.post("/editGroup", async (req, res) => {
  // Parse the cookies
  const cookies = cookieParser(req);

  // Assume the given user is not valid to begin with
  let authResult = false;

  // Set up the query
  const values = [cookies["email"], cookies["session"], req.ip];
  console.log("Authenticating -- Email: " + values[0] + " sid: " + values[1] + " IP: " + values[2]);
  let query = "SELECT * FROM session where email = $1 AND id = $2 AND ip = $3";

  // Check to see if the given values exist in the session table
  client.query(query, values, (err, response) => {
    if (err) {
      printError(err, "Unable to query when authenticating " + cookies["email"]);
      authResult = false;
    } else {
      if (response.rows.length !== 0) {
        const date = new Date();
        authResult = date.toISOString() <= String(response.rows[0].expires);
        console.log("Setting auth result to: " + authResult);
      }
      // If authResult is still false -> Invalidate session and send to login
      if (!authResult) {
        res.clearCookie("email");
        res.clearCookie("session");
        res.status(401).redirect("/");
      } else {
        const query = "SELECT leader FROM group_ WHERE groupid = $1";
        client.query(query, [req.body.groupID], async (err, response) => {
          if (err) {
            printError(err, "Error validating leader (001)");
            res.status(403);
          }
          else {
            console.log("IN")
            if (response.rows.length !== 0) {
              console.log("length > 0")
              console.log(response.rows[0]);
              console.log(cookies["email"]);
              console.log(response.rows[0].leader === cookies["email"])
              if (response.rows[0].leader === cookies["email"]) {
                console.log("User is leader");
                const query = "UPDATE group_ "
                    + "SET groupname = $1, "
                    + "groupdesc = $2, "
                    + "private = $3, "
                    + "tagname = $4 "
                    + "WHERE leader = $5 AND groupid = $6;"
                const values = [req.body.groupname, req.body.groupdesc, req.body.private, req.body.tagname, cookies["email"], req.body.groupID];
                console.log("Values: " + values.toString());

                client.query(query, values, (err, response) => {
                  if (err) {
                    printError(err, "Error updating group information!");
                    res.status(503).send("Error updating group information!");
                  } else {
                    if (req.body.url !== "") {
                      const query = "UPDATE grouppics "
                          + "SET pic = $1 "
                          + "WHERE groupid = $2;"
                      const values = [req.body.url, req.body.groupID];
                      client.query(query, values, (err, response) => {
                        if (err) {
                          printError(err, "Error updating group picture!");
                          res.status(503).send("Error updating group picture!");
                        } else {
                          console.log("Group information successfully updated!");
                          res.status(201).send("Group information successfully updated!");
                        }
                      });
                    } else {
                      console.log("Group information successfully updated!");
                      res.status(201).send("Group information successfully updated!");
                    }
                  }
                });
              }
            }
          }
        });
      }
    }
  });
});


// TODO - Remove/change
router.post("/createTag", async (req, res) => {
  // Parse the cookies
  const cookies = cookieParser(req);

  // Assume the given user is not valid to begin with
  let authResult = false;

  // Set up the query
  const values = [cookies["email"], cookies["session"], req.ip];
  console.log("Authenticating -- Email: " + values[0] + " sid: " + values[1] + " IP: " + values[2]);
  let query = "SELECT * FROM session where email = $1 AND id = $2 AND ip = $3";

  // Check to see if the given values exist in the session table
  client.query(query, values, async (err, response) => {
    if (err) {
      printError(err, "Unable to query when authenticating " + cookies["email"]);
      authResult = false;
    } else {
      if (response.rows.length !== 0) {
        const date = new Date();
        authResult = date.toISOString() <= String(response.rows[0].expires);
        console.log("Setting auth result to: " + authResult);
      }
      // If authResult is still false -> Invalidate session and send to login
      if (!authResult) {
        res.clearCookie("email");
        res.clearCookie("session");
        res.status(401).redirect("/");
      } else {

      }
    }
  });
});

// !!!!!!!!!!!!!!!!!!!!!!!!!!!!! INVITE PAGE RELATED GET AND POST ROUTES !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
//invite page for the user
router.get("/invites", async (req, res) => {
  // Parse the cookies
  const cookies = cookieParser(req);

  // Assume the given user is not valid to begin with
  let authResult = false;

  // Set up the query
  const values = [cookies["email"], cookies["session"], req.ip];
  console.log("Authenticating -- Email: " + values[0] + " sid: " + values[1] + " IP: " + values[2]);
  let query = "SELECT * FROM session where email = $1 AND id = $2 AND ip = $3";

  // Check to see if the given values exist in the session table
  client.query(query, values, (err, response) => {
    if (err) {
      printError(err, "Unable to query when authenticating " + cookies["email"]);
      authResult = false;
    } else {
      if (response.rows.length !== 0) {
        const date = new Date();
        authResult = date.toISOString() <= String(response.rows[0].expires);
        console.log("Setting auth result to: " + authResult);
      }
      // If authResult is still false -> Invalidate session and send to login
      if (!authResult) {
        res.clearCookie("email");
        res.clearCookie("session");
        res.status(401).redirect("/");
      } else {
        showInvites(cookies["email"], res);
      }
    }
  });
});

// Accept group invitation
router.get("/joinGroup/:groupID", async (req, res) => {
  // Parse the cookies
  const cookies = cookieParser(req);

  // Assume the given user is not valid to begin with
  let authResult = false;

  // Set up the query
  const values = [cookies["email"], cookies["session"], req.ip];
  console.log("Authenticating -- Email: " + values[0] + " sid: " + values[1] + " IP: " + values[2]);
  let query = "SELECT * FROM session where email = $1 AND id = $2 AND ip = $3";

  // Check to see if the given values exist in the session table
  client.query(query, values, (err, response) => {
    if (err) {
      printError(err, "Unable to query when authenticating " + cookies["email"]);
      authResult = false;
    } else {
      if (response.rows.length !== 0) {
        const date = new Date();
        authResult = date.toISOString() <= String(response.rows[0].expires);
        console.log("Setting auth result to: " + authResult);
      }
      // If authResult is still false -> Invalidate session and send to login
      if (!authResult) {
        res.clearCookie("email");
        res.clearCookie("session");
        res.status(401).redirect("/");
      } else {
        const query = "UPDATE member_ SET status = true WHERE email = $1 AND groupid = $2";
        const values = [cookies["email"], req.params["groupID"]];
        client.query(query, values, (err, response) => {
          if (err) {
            printError(err, "Error updating group membership")
            res.status(503);
          } else res.status(200).redirect("/invites");
        });
      }
    }
  });
});

// Decline group invitation
router.get("/declineGroup/:groupID", async (req, res) => {
  // Parse the cookies
  const cookies = cookieParser(req);

  // Assume the given user is not valid to begin with
  let authResult = false;

  // Set up the query
  const values = [cookies["email"], cookies["session"], req.ip];
  console.log("Authenticating -- Email: " + values[0] + " sid: " + values[1] + " IP: " + values[2]);
  let query = "SELECT * FROM session where email = $1 AND id = $2 AND ip = $3";

  // Check to see if the given values exist in the session table
  client.query(query, values, (err, response) => {
    if (err) {
      printError(err, "Unable to query when authenticating " + cookies["email"]);
      authResult = false;
    } else {
      if (response.rows.length !== 0) {
        const date = new Date();
        authResult = date.toISOString() <= String(response.rows[0].expires);
        console.log("Setting auth result to: " + authResult);
      }
      // If authResult is still false -> Invalidate session and send to login
      if (!authResult) {
        res.clearCookie("email");
        res.clearCookie("session");
        res.status(401).redirect("/");
      } else {
        const query = "DELETE FROM member_ WHERE email = $1 AND groupid = $2";
        const values = [cookies["email"], req.params["groupID"]];
        client.query(query, values, (err, response) => {
          if (err) {
            printError(err, "Error refusing group invite");
            res.status(503);
          }
          else res.status(200).redirect("/invites");
        });
      }
    }
  });
});

// Accept event invitation
router.get("/joinEvent/:eventID", async (req, res) => {
  // Parse the cookies
  const cookies = cookieParser(req);

  // Assume the given user is not valid to begin with
  let authResult = false;

  // Set up the query
  const values = [cookies["email"], cookies["session"], req.ip];
  console.log("Authenticating -- Email: " + values[0] + " sid: " + values[1] + " IP: " + values[2]);
  let query = "SELECT * FROM session where email = $1 AND id = $2 AND ip = $3";

  // Check to see if the given values exist in the session table
  client.query(query, values, (err, response) => {
    if (err) {
      printError(err, "Unable to query when authenticating " + cookies["email"]);
      authResult = false;
    } else {
      if (response.rows.length !== 0) {
        const date = new Date();
        authResult = date.toISOString() <= String(response.rows[0].expires);
        console.log("Setting auth result to: " + authResult);
      }
      // If authResult is still false -> Invalidate session and send to login
      if (!authResult) {
        res.clearCookie("email");
        res.clearCookie("session");
        res.status(401).redirect("/");
      } else {
        const query = "UPDATE attend SET attending = true WHERE email = $1 AND eventid = $2";
        const values = [cookies["email"], req.params["eventID"]];
        client.query(query, values, (err, response) => {
          if (err) {
            printError(err, "Error accepting event invitation");
            res.status(503);
          }
          else res.status(200).redirect("/invites");
        });
      }
    }
  });
});
// Decline event invitation
router.get("/declineEvent/:eventID", async (req, res) => {
  // Parse the cookies
  const cookies = cookieParser(req);

  // Assume the given user is not valid to begin with
  let authResult = false;

  // Set up the query
  const values = [cookies["email"], cookies["session"], req.ip];
  console.log("Authenticating -- Email: " + values[0] + " sid: " + values[1] + " IP: " + values[2]);
  let query = "SELECT * FROM session where email = $1 AND id = $2 AND ip = $3";

  // Check to see if the given values exist in the session table
  client.query(query, values, (err, response) => {
    if (err) {
      printError(err, "Unable to query when authenticating " + cookies["email"]);
      authResult = false;
    } else {
      if (response.rows.length !== 0) {
        const date = new Date();
        authResult = date.toISOString() <= String(response.rows[0].expires);
        console.log("Setting auth result to: " + authResult);
      }
      // If authResult is still false -> Invalidate session and send to login
      if (!authResult) {
        res.clearCookie("email");
        res.clearCookie("session");
        res.status(401).redirect("/");
      } else {
        const query = "DELETE FROM attend WHERE email = $1 AND eventid = $2";
        const values = [cookies["email"], req.params["eventID"]];
        client.query(query, values, (err, response) => {
          if (err) {
            printError(err, "Error declining event invitation");
            res.status(503);
          }
          else res.status(200).redirect("/invites");
        });
      }
    }
  });
});

router.post("groupInfoPage", async (req, res) => {
  // Parse the cookies
  const cookies = cookieParser(req);

  // Assume the given user is not valid to begin with
  let authResult = false;

  // Set up the query
  const values = [cookies["email"], cookies["session"], req.ip];
  console.log("Authenticating -- Email: " + values[0] + " sid: " + values[1] + " IP: " + values[2]);
  let query = "SELECT * FROM session where email = $1 AND id = $2 AND ip = $3";

  // Check to see if the given values exist in the session table
  client.query(query, values, (err, response) => {
    if (err) {
      printError(err, "Unable to query when authenticating " + cookies["email"]);
      authResult = false;
    } else {
      if (response.rows.length !== 0) {
        const date = new Date();
        authResult = date.toISOString() <= String(response.rows[0].expires);
        console.log("Setting auth result to: " + authResult);
      }
      // If authResult is still false -> Invalidate session and send to login
      if (!authResult) {
        res.clearCookie("email");
        res.clearCookie("session");
        res.status(401).redirect("/");
      } else {
        let gId = req.body.groupID;
        res.redirect("groupPage/" + gId + "/groupInfo");
      }
    }
  });
});

router.get("groupPage/:groupID/groupInfo", async (req, res) => {
  // Parse the cookies
  const cookies = cookieParser(req);

  // Assume the given user is not valid to begin with
  let authResult = false;

  // Set up the query
  const values = [cookies["email"], cookies["session"], req.ip];
  console.log("Authenticating -- Email: " + values[0] + " sid: " + values[1] + " IP: " + values[2]);
  let query = "SELECT * FROM session where email = $1 AND id = $2 AND ip = $3";

  // Check to see if the given values exist in the session table
  client.query(query, values, (err, response) => {
    if (err) {
      printError(err, "Unable to query when authenticating " + cookies["email"]);
      authResult = false;
    } else {
      if (response.rows.length !== 0) {
        const date = new Date();
        authResult = date.toISOString() <= String(response.rows[0].expires);
        console.log("Setting auth result to: " + authResult);
      }
      // If authResult is still false -> Invalidate session and send to login
      if (!authResult) {
        res.clearCookie("email");
        res.clearCookie("session");
        res.status(401).redirect("/");
      } else {
        displayGroupInfo(req, res);
      }
    }
  });
});
// !!!!!!!!!!!!!!!!!!!!!!!!!!!!! INVITE PAGE RELATED GET AND POST ROUTES !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

// ######################################################
// #                    FUNCTIONS                       #
// ######################################################

// [DONE] Error printing:
function printError(err) {
  if (arguments.length === 1) {
    console.log("************************************");
    console.log(arguments[0]);
    console.log("************************************");
  } else {
    for (let i = 1; i < arguments.length; i++) {
      console.log(arguments[i]);
    }
    console.log("************************************");
    console.log(arguments[0]);
    console.log("************************************");
  }
}

// [DONE] Validate the current session
/*async function authenticate(email, sessionid, IP) {
    let values = [email, sessionid, IP];
    console.log("Authenticating -- Email: " + values[0] + " sid: " + values[1] + " IP: " + values[2]);
    let query = "SELECT * FROM session where email = $1 AND id = $2 AND ip = $3";

    await client.query(query, values, async (err, response) => {
      if (err) {
        printError(err, "Unable to query when authenticating " + email);
        return false;
      } else {
        const date = new Date();

        if (response.rows.length === 0) {
          //console.log("Authentication failed");
          return false;
          // return new Error("Authentication failed - invalid details");
        } else {
          let s = ((date.toISOString() <= String(response.rows[0].expires)) ? "passed" : "failed")
          console.log("Authentication " + s);

          return date.toISOString() <= String(response.rows[0].expires);
        }
      }
    });
}*/

// [DONE] User login and registration functions
async function login(req, res) {
  console.log("in login");
  // Grab the values
  let loginEmail = req.body.loginEmail;
  let loginPass = req.body.loginPassword;
  let ip = getClientIp(req);

  console.log(loginEmail);
  console.log(loginPass);
  // Set up the query
  const query = "SELECT email, password FROM users WHERE email = $1 AND password = $2";
  const values = [loginEmail, loginPass];

  client.query(query, values, (err, response) => {
    if (err) {
      printError(err, "1");
    } else {
      // If the given credentials don't exist in the database
      if (response.rows.length === 0) {
        let login_reg_status = {
          status: "login-fail"
        };
        res.status(401).json({status: login_reg_status});
      } else {
        console.log("VALID CREDENTIALS");
        // User exists in the database
        // => Delete any sessions with the current IP address
        const query = "DELETE FROM session WHERE ip = $1 AND email = $2";
        const values = [ip, loginEmail];
        
        client.query(query, values, async (err, response) => {
          if (err) {
            printError(err, "2");
          } else {
            // Create a new session for this login
            let sessionID = await uid(18).then((e) => {
              return e;
            });

            const query = "INSERT INTO session VALUES($1, $2, $3, to_timestamp($4), to_timestamp($5))";
            const values = [ip, sessionID, loginEmail, (Date.now() / 1000), (Date.now() / 1000) + 1209600];

            console.log("IP ADDRESS: " + req.ip);
            console.log("IP ADDRESSES: " + req.ips);
            console.log("FUNCTION IP: " + ip);
            

            // Store the session in the database
            client.query(query, values, (err, response) => {
              if (err) {
                printError(err, "3");
              } else {
                console.log("STORING COOKIES");
                // Successfully stored in database => store as cookie
                res.cookie("session", sessionID, {expires: new Date(Date.now() + 1209600000), secure: true});
                res.cookie("email", loginEmail, {expires: new Date(Date.now() + 1209600000), secure: true});
                console.log("COOKIES STORED");
                // Redirect to the home page
                res.redirect("/home");
              }
            })
          }
        });
        //console.log("temp: " + temp);
      }
    }
  });

}
async function register(req, res) {
  // Grab the register info
  let regEmail = req.body.registerEmail;
  let regPass = req.body.registerPassword;
  let first = req.body.first;
  let last = req.body.last;

  // Set up the query
  // create a query
  const query = "INSERT INTO users (email, password, first, last, bio, status, location) VALUES($1, $2, $3, $4, $5, $6, $7)";
  const values = [regEmail, regPass, first, last, "", false, ""];

  // Execute insert query
  client.query(query, values, (err, response) => {
    // if an error happens, the user is trying to use an email that already exists
    if (err) {
      console.log(err.stack);
      let login_reg_status = {
        status: "register-fail"
      };
      // send back to the login page
      res.render("login", {status: JSON.stringify(login_reg_status)});
    }
    // register successful
    else {
      let login_reg_status = {
        status: "register-success"
      };
      // send back to the login page
      res.render("login", {status: JSON.stringify(login_reg_status)});
    }
  });
}

// [DONE] Parses cookies in the header of the req
function cookieParser(req) {
  let rawCookies = req.headers.cookie.split('; ');
  let parsedCookies = {};
  rawCookies.forEach(rc => {
    let pc = rc.split('=');
    parsedCookies[pc[0]] = pc[1];
  });

  parsedCookies["email"] = decodeURIComponent(parsedCookies["email"]);

  return parsedCookies;
}

// [DONE]
// Displays the posts for a given board in a given group
function displayBoard(req, res, boardID, groupID, email) {
  // Variable declarations
  let groupInfo = [], boardInfo = [], postData = [];
  let postScores = new Map(),
      userScores = new Map();

  // Retrieve the information for the group
  //   that the board is in.
  let query = "SELECT * "
      + "FROM group_ "
      + "WHERE groupid = $1;";
  let values = [groupID];

  client.query(query, values, (err, response) => {
    if (err) printError(err, "Error retrieving board information.");
    else {
      if (response.rows.length === 0) {
        res.status(404);
      } else {
        // Store the information
        groupInfo = response.rows;

        // Retrieve the information for the board
        query =
            "SELECT * " +
            "FROM board " +
            "WHERE boardid = $1;";
        values = [boardID];
        client.query(query, values, (err, response) => {
          if (err) {
            printError(err, "Failed to get board info");
          } else {
            boardInfo = response.rows;
            // Get the # of votes for each post in the board
            const query = "(SELECT postid, COUNT(*) as postvotes "
                + "FROM post NATURAL JOIN postlist NATURAL JOIN cubvoted "
                + "WHERE boardid = $1 "
                + "GROUP BY postid)"
                + " UNION "
                + "(SELECT postid, 0 as postvotes "
                + "FROM post NATURAL JOIN postlist "
                + "WHERE postid NOT IN (SELECT postid FROM cubvoted) AND "
                + "boardid = $1);"

            const values = [boardID];
            client.query(query, values, (err, response) => {
              if (err) {
                printError(err, "Error getting post scores")
              } else {
                // Build postScores
                response.rows.forEach((r) => {
                  postScores.set(r.postid, r.postvotes);
                });

                // Get the user scores specifically for those who have posted in this board
                const query
                    = "WITH voters AS ("
                    + "SELECT postowner, COUNT(*) as uservotes "
                    + "FROM post NATURAL JOIN postlist NATURAL JOIN cubvoted "
                    + "WHERE postowner IN (SELECT postowner FROM post NATURAL JOIN postlist where boardid = $1) "
                    + "GROUP BY postowner) "
                    + "SELECT * FROM voters "
                    + "UNION "
                    + "SELECT postowner, 0 as uservotes "
                    + "FROM post NATURAL JOIN postlist "
                    + "WHERE postowner IN (SELECT postowner FROM post NATURAL JOIN postlist where boardid = $1) "
                    + "AND postowner NOT IN (SELECT postowner FROM voters) "
                    + "GROUP BY postowner;"
                client.query(query, values, (err, response) => {
                  if (err) {printError(err, "Error retrieving user scores")}
                  else {

                    // Build userScores
                    response.rows.forEach((r) => {
                      userScores.set(r.postowner, r.uservotes);
                    });
                    console.log(userScores);

                    // Get the post information
                    const query = "SELECT postowner as email, first, last, postid, postcontent, postdate, posttime "
                        + "FROM postlist NATURAL JOIN post JOIN users "
                        + "ON users.email = post.postowner "
                        + "WHERE boardid = $1 "
                        + "ORDER BY postdate ASC, posttime ASC;"

                    client.query(query, [boardID], (err, response) => {
                      if (err) {
                        printError(err, "Error retrieving post info");
                      } else {

                        // Build postData
                        let i = 0;
                        response.rows.forEach((r) => {
                          postData[i] =
                              {
                                email: r.email,
                                first: r.first,
                                last: r.last,
                                uservotes: userScores.get(r.email),
                                postid: r.postid,
                                postcontent: r.postcontent,
                                postdate: r.postdate,
                                posttime: r.posttime,
                                postvotes: postScores.get(r.postid)
                              };
                          i++;
                        });

                        let returnData = {
                          email: email,
                          groupInfo: groupInfo,
                          boardInfo: boardInfo,
                          posts: postData
                        }
                        res.render("groupBoardPage", {data: JSON.stringify(returnData)});
                      }
                    });
                  }
                });
              }
            });
          }
        });
      }
    }
  });
}
// [DONE]
function createPost(req, res) {
  console.log("IN CREATE POST");
  // Variable Declarations
  let email = req.body.email;
  let postID = Math.floor(Math.random() * 100000000);
  let msg = req.body.message;
  let date = new Date;
  let time = date.getHours() + ":" + date.getMinutes() + ":" + date.getSeconds();
  let firstname;
  let lastname;
  let groupID = req.body.groupID;
  let boardID = req.body.boardID;

  // Verify that the current user is a member of the group which has the board the post will be added to
  const memberQuery = "SELECT users.email, groupid, boardid, first, last FROM member_ natural join boardlist join users ON member_.email = users.email WHERE member_.banned = false AND users.email = $1 AND boardid = $2";
  client.query(memberQuery, [email, boardID], (err, response) => {
    if (err) {
      printError(err, "Error verifying group membership");
      res.status(401).redirect("/home");
    } else if (response.rows.length !== 0) {
      console.log("MEMBERQUERY DONE");
      firstname = response.rows[0].first;
      lastname = response.rows[0].last;

      const postQuery = "INSERT INTO post (postid, postcontent, postowner, postdate, posttime) VALUES($1, $2, $3, $4, $5)";
      const values = [postID, msg, email, date, time];
      client.query(postQuery, values, (err, response) => {
        if (err) {
          printError("Error inserting post");
          console.log(values);
          res.status(503);
        } else {
          console.log("POSTQUERY DONE");
          const postListQuery = "INSERT INTO postlist (postid, boardid) VALUES($1, $2)";
          client.query(postListQuery, [postID, boardID], (err, response) => {
            if (err) {
              printError(err, "Error inserting post to master table");
              const errorQuery = "DELETE FROM post where postid = $1";
              client.query(errorQuery, [postID], (err, response) => {
                if (err) printError(err, "MEGA ERROR: DANGLING POST NOT DELETED");
                res.status(503);
              });
            } else {

              const query
                  = "WITH voters AS ("
                  + "SELECT postowner, COUNT(*) as uservotes "
                  + "FROM post NATURAL JOIN postlist NATURAL JOIN cubvoted "
                  + "WHERE postowner IN (SELECT postowner FROM post NATURAL JOIN postlist where boardid = $1) "
                  + "GROUP BY postowner) "
                  + "SELECT * FROM voters "
                  + "UNION "
                  + "SELECT postowner, 0 as uservotes "
                  + "FROM post NATURAL JOIN postlist "
                  + "WHERE postowner IN (SELECT postowner FROM post NATURAL JOIN postlist where boardid = $1) "
                  + "AND postowner NOT IN (SELECT postowner FROM voters) "
                  + "GROUP BY postowner;"


              client.query(query, [boardID], (err, response) => {
                if (err) printError(err, "Error getting user score for new post");
                else {
                  let uservotes;

                  response.rows.forEach((r) => {
                    if (r.postowner === email) {
                      uservotes = r.uservotes;
                    }
                  })

                  //putting post information into object
                  let newPost = {
                    type: "newMessage",
                    email: email,
                    first: firstname,
                    last: lastname,
                    postid: postID,
                    postcontent: msg,
                    posttime: time,
                    postdate: date,
                    postvotes: 0,
                    uservotes: uservotes
                  }
                  console.log("Emitting new post");
                  io.to(groupID + "/" + boardID).emit("newMessage", newPost);
                  console.log("After emitting new post");
                  res.status(200).json(newPost);
                }
              });
            }
          });
        }
      });
    } else {
      console.log("OOPSIE WOOPSIE");
    }
  });
  res.status(404);
}
// [DONE]
function deletePost(req, res) {
  let email = req.body.userID;
  let postID = req.body.postID;
  let groupID = req.body.groupID;
  // let boardID = req.body.boardID;
  console.log("Delete info: " + email + "\t" + postID + "\t" + groupID);

  // Verify that the user is in the group and is capable of deleting the
  const query = "SELECT email "                 // 1)
      + "FROM member_ join post "
      + "ON member_.email = post.postowner "
      + "WHERE groupid = $1 AND email = $2 "
      + "UNION "
      + "SELECT leader as email "               // 2)
      + "FROM group_ "
      + "WHERE groupid = $1 "
      + "UNION "
      + "SELECT email "                         // 3)
      + "FROM member_ "
      + "WHERE moderator = true;";

  client.query(query, [groupID, email], (err, response) => {
    if (err) {
      printError(err, "Error validating user");
    } else if (response.rows.length === 0) {
      printError(err, "User is not able to delete this post! (001)");
    } else {
      // Verify that the user is either:
      // 1) The creator of the post
      // 2) The leader of the group
      // 3) A moderator of the group
      let valid = false;
      for (let i = 0; i < response.rows.length; i++) {
        if (!valid && response.rows[i].email === email)
          valid = true;
      }

      if (valid) {
        //removing post from postlist
        const query = "DELETE FROM postlist WHERE postid = $1";
        client.query(query, [postID], (err, response) => {
          if (err) {
            printError(err, "Failed to delete post (002)");
            res.status(500);
          } else {
            const query = "DELETE FROM cubvoted WHERE postid = $1";
            client.query(query, [postID], (err, response) => {
              if (err) {
                printError(err, "Failed to delete post (003)");
                res.status(500);
              } else {
                const query = "DELETE FROM post WHERE postid = $1";
                client.query(query, [postID], (err, response) => {
                  if (err) {
                    printError(err, "Failed to delete post (004)");
                    res.status(500);
                  } else {
                    console.log("Deleting post!");
                    res.status(200).json({post: postID});
                  }
                });
              }
            });
          }
        });
      } else {
        res.status(401);
      }
    }
  });
}

// Create a group using the parameters given
// TODO - add await deleteGroup()
// TODO - on failure show creation modal again with error
async function createGroup(leader, name, desc, isPrivate, tag, pic, res) {
  //let groupid = await uid(18).then(e => e);
  let groupid = Math.floor(Math.random() * 100000000);
  let created = false;

  // Create the group in the database
  const query = "INSERT INTO group_(groupid, leader, groupname, groupdesc, private) VALUES($1, $2, $3, $4, $5)";
  const values = [groupid, leader, name, desc, isPrivate];

  client.query(query, values, (err, response) => {
    // If the group isn't successfully made
    if (err) {
      printError(err, "Error creating group (001)");
      created = false;
    } else {
      // insert user into the member table
      const query = "INSERT INTO member_(email, groupid, status, joindate, invitedate) VALUES($1, $2, $3, $4, $5)";
      const values = [leader, groupid, true, new Date, new Date];
      client.query(query, values, (err, response) => {
        // Failed member insertion fallback
        if (err) {
          printError(err, "Error inserting member (002)");
          created = false;
          // Successful member insertion
        } else {
          created = true;
          // insert group and tag into grouptags
          const query = "INSERT INTO grouptags (groupid, tagname) VALUES ($1, $2)";
          const values = [groupid, tag];
          client.query(query, values, (err, response) => {
            if (err) {
              printError(err, "Error inserting tag to list (004)");
              created = false;
            }
            else {
              if (pic !== "") {
                // insert group photo url into grouppics
                const query = "INSERT INTO grouppicture (groupid, pic) VALUES ($1, $2)";
                const values = [groupid, pic];
                client.query(query, values, (err, response) => {
                  if (err) {
                    printError("Error adding picture to group (005)");
                    created = false;
                  } else {
                    created = true;
                  }
                  if (!created) {
                    // TODO add await deleteGroup
                    res.status(503).redirect("/home");
                  } else {
                    res.status(200).redirect("/groupPage/" + groupid);
                  }
                });
              }
            }
          });
        }
      });
    }
  });
}

// [DONE]
async function joinGroup(email, groupID, res) {
  let date = new Date();

  const query = "INSERT INTO member_(email, groupid, status, joindate, invitedate) VALUES($1, $2, $3, $4, $4)";

  client.query(query, [email, groupID, true, date], (err, response) => {
    if (err) {
      printError(err, "Error joining group");
      res.status(503).redirect("/groupMenuPage");
    } else {
      console.log("Group joined successfully");
      res.status(200).redirect("/home");
    }
  });
}

// [DONE]
function createBoard(req, res) {
  let boardID = Math.floor(Math.random() * 100000000);
  let boardName = req.body.boardName;
  let boardDesc = req.body.boardDesc;
  let groupID = req.body.groupID;

  console.log("BoardID: " + boardID);
  console.log("GroupID: " + groupID);

  // Insert new board into board table
  const query = "INSERT INTO board (boardid, boardname, boarddesc) VALUES($1, $2, $3)";
  const values = [boardID, boardName, boardDesc];
  client.query(query, values, (err, response) => {
    if (err) {
      printError(err, "Error inserting board (001)");
      res.status(503);
    } else {
      // Insert into boardlist table
      const query = "INSERT INTO boardlist (boardid, groupid) VALUES($1, $2)";
      const values = [boardID, groupID];

      client.query(query, values, (err, response) => {
        if (err) {
          printError(err, "Error inserting board (002)")
          res.status(503);
        } else {
          res.status(200).redirect("/groupPage/" + groupID);
        }
      });
    }
  });
}

// [DONE]
// Currently, only the leader can do this.
// Can be changed to allow moderators to delete them as well.
// In my opinion, boards should have a boolean column 'archived' for mod deletion
function deleteBoard(groupID, boardID, email, res) {
  // Verify the user is able to delete the board
  const query = "SELECT leader as email "
      + "FROM group_ "
      + "WHERE groupid = $1";
  client.query(query, [groupID], (err, response) => {
    if (err) {
      printError(err, "Error verifying leader status");
    } else {
      if (response.rows.length !== 0) {
        if (response.rows[0].email === email) {
          // Delete the posts in the board
          const query = "DELETE FROM post WHERE postid IN (SELECT postid FROM postlist WHERE boardid = $1)";
          client.query(query, [boardID], (err, response) => {
            if (err) {
              printError(err, "Error deleting board posts!");
              res.status(503);
            } else {
              const query = "DELETE FROM board WHERE boardid = $1";
              client.query(query, [boardID], (err, response) => {
                if (err) printError(err, "Error deleting board");
                else {
                  res.status(200).redirect("/groupPage/" + groupID);
                }
              });
            }
          });
        }
      }
      res.status(404);
    }
  });
}

// [DONE] TODO - socketio stuff
function groupInviteUser(req, res, userEmail, inviteEmail, groupID) {

  // Check if the sender is in the group they're trying to invite someone to
  let query = "SELECT email "
      + "FROM member_ "
      + "WHERE groupid = $1 AND email = $2";
  client.query(query, [groupID, userEmail], (err, response) => {
    if (err) {
      printError(err, "email: " + userEmail + ", groupID: " + groupID + " => could not query for email in members_ table with previous values");
      res.status(503);
    }
    else if (response.rows.length !== 0) {
      // The user inviting the person IS in the group
      let inviteDate = new Date();

      // Put the invitee in the member_ table
      let query = "INSERT INTO member_ VALUES($1, $2, $3, $4, $4, $5, $5)";
      let values = [inviteEmail, groupID, false, inviteDate, false];
      client.query(query, values, (err, response) => {
        if (err) {
          printError(err, "User: " + inviteEmail + "=> cannot be insert into member_ table");
          res.status(503);
        }
        else {
          let query = "SELECT groupname "
              + "FROM group_ "
              + "WHERE groupid = $1";
          client.query(query, [groupID], (err, response) => {
            if (err) {
              printError(err, "groupid: " + groupID + " => not in group_ table");
              res.status(503);
            }
            else {
              res.status(201).send("Invite sent!");
            }
          });
        }
      });
    }
  });
}

// [DONE]
function createEvent(email, eventName, eventDesc, time, groupID, res) {
  console.log(groupID);

  // Ensure the user is a member of the group in which the event is being created
  const query = "SELECT email FROM member_ WHERE email = $1";
  client.query(query, [email], (err, response) => {
    if (err) printError(err, "Error determining group membership");
    else if (response.rows.length !== 0) {
      // Generate event ID
      let eId = Math.floor(Math.random() * 100000000);

      // Parse the dates and times
      let startDate = time.substring(0, 10);
      let startTime = time.substring(11, 19);
      let startUnix = Date.parse(startDate + " " + startTime);

      let endDate = time.substring(22, 32);
      let endTime = time.substring(33);
      let endUnix = Date.parse(endDate + " " + endTime);

      //console.log(startDate + " " + startTime + " " + startUnix + "     " + endDate + " " + endTime + " " + endUni
      const query = "INSERT INTO event VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)";
      const values = [eId, eventName, eventDesc, startTime, endTime, startDate, endDate, email, groupID, startUnix, endUnix];
      //values.forEach(e => console.log(e));
      client.query(query, values, (err, response) => {
        if (err) printError(err, "Error creating event");
        else {
          let event = {enddate: endDate,
            endtime: endTime,
            endunix: endUnix,
            eventdesc: eventDesc,
            eventid: eId,
            eventname: eventName,
            groupid: groupID,
            host: email,
            startdate: startDate,
            starttime: startTime,
            startunix: startUnix}
          console.log("Emitting event to: " + groupID);
          io.to(groupID).emit("newEvent", event);
          console.log("After event emit");
          res.status(200).json(event);
        }
      });
    } else {
      res.status(403);
    }
  });
}


function editEvent(req, res, eventName, eventDesc, eventID) {
  const query =
      "UPDATE event " +
      "SET eventname = $1 " +
      "eventdesc = $2 " +
      "WHERE eventID = $3 ";
  const values = [eventID, eventDesc, eventID]
  client.query(query, values, (err, response) => {
    if (err) {
      printError(err, "Error retrieving owner of post (001)");
    } else {

    }
  });
}
// [DONE] displays the invites page
function showInvites(email, res) {
  // Get the user's information
  const query = "SELECT email, first, last, bio, status, location FROM users WHERE email = $1";
  let user, events, groups;

  client.query(query, [email], (err, response) => {
    if (err) printError(err, "Error retrieving user information");
    else {
      user = response.rows[0];

      // getting the events they've been invited to // can change
      const query = "WITH eventsInvited AS (SELECT * FROM attend WHERE email = $1 and attending = false) " +
          "SELECT * FROM event natural join eventsInvited";
      client.query(query, [email], (err, response) => {
        if (err) printError(err, "Error retrieving event invitations");
        else {
          events = response.rows;

          // getting the groups they have been invited to // can change
          const query = "WITH groupsInvited AS (SELECT * FROM member_ WHERE email = $1 and status = false) "
              + "SELECT * FROM group_ natural join groupsInvited"
          client.query(query, [email], (err, response) => {
            if (err) printError(err, "Error retrieving group invitations");
            else {
              groups = response.rows;
              const obj = {
                user: user,
                events: events,
                groups: groups
              }
              console.log(obj);
              res.render("invites", {obj: obj});
            }
          });
        }
      });
    }
  });
}

// [DONE] Updated changePostVote
// Add or remove a user's vote for a post
function changePostVote(req, res) {
  let email = req.body.userID;
  let postid = req.body.postID;
  let groupID = req.body.groupID;
  let boardID = req.body.boardID;
  let postowner;

  console.log("changePostVote email: " + email);

  const query = "SELECT postowner FROM post WHERE postid = $1;"
  client.query(query, [postid], (err, response) => {
    if (err) {
      printError(err, "Error retrieving owner of post (001)");
    } else {
      postowner = response.rows[0].postowner;
      // Check if user has already voted
      let query =
          "SELECT * " +
          "FROM cubvoted " +
          "WHERE email = $1 AND postid = $2";
      client.query(query, [email, postid], (err, response) => {
        if (err) {
          printError(err, "Error retrieving vote status (002)");
        } else {
          //User didn't upvote, insert their vote into cubvoted
          if (response.rows.length === 0) {
            console.log("USER IS ADDING VOTE");
            let query =
                "INSERT INTO cubvoted (postid, email) VALUES($1, $2)";
            client.query(query, [postid, email], (err, response) => {
              if (err) {
                printError(err, "Error adding vote (003a)");
                res.status(400);
              } else {
                console.log("Emitting: " + postid + " " + postowner + " " + true);
                let postInfo = {postid: postid,
                  postowner: postowner,
                  increase: true};
                io.to(groupID + "/" + boardID).emit("changeVote", postInfo);

                res.status(200);
              }
            });
          } else {
            console.log("USER IS REMOVING VOTE");
            // User has already voted, delete their vote from cubvoted
            query = "DELETE FROM cubvoted WHERE postid = $1 AND email = $2";
            client.query(query, [postid, email], (err, response) => {
              if (err) {
                printError(err, "Error removing vote for post (003b)")
              } else {
                console.log("Emitting: " + postid + " " + postowner + " " + false);
                let postInfo = {postid: postid,
                  postowner: postowner,
                  increase: false};

                io.to(groupID + "/" + boardID).emit("changeVote", postInfo);
                res.status(201);
              }
            });
          }
        }
      });
    }
  });
}

// [DONE] Inserts a tag into the tag table and adds it to the group
// async function createTag(tagName, groupID) {
//
//   let query = "INSERT INTO tag (tagname) VALUES($1) "
//   client.query(query, [tagName], async (err, response) => {
//     if (err) {
//       printError(err, "Error inserting tag");
//       return 500;
//     } else {
//       return await addGroupTag(tagName, groupID);
//     }
//   });
//   return 500;
// }

// [DONE] Adds a tag to a group
function addGroupTag(groupTag, groupID) {
  // Checking if the tag already exists
  const query =
      "SELECT tagname " +
      "FROM tag " +
      "where tagname = $1";
  client.query(query, [groupTag], (err, response) => {
    if (err) printError(err, "Error finding tag (001)");
    // If the tag doesn't exist => Check if it's a grouptag
    else if (response.rows.length === 0) {
      const query = "SELECT * "
          + "FROM grouptags "
          + "WHERE tagname = $1 AND groupid = $2";
      client.query(query, [groupTag, groupID], (err, response) => {
        if (err) printError(err, "Error finding tag (002)");
        // Not in grouptags => insert into grouptags
        else if (response.rows.length === 0) {
          const query = "INSERT INTO grouptags (groupid, tagname) VALUES ($1,$2)";
          client.query(query, [groupID, groupTag], (err, response) => {
            if (err) {
              printError(err, "Error adding tag (003)");
              return 500;
            } else {
              return 201;
            }
          });
        } else {
          return 400;
        }
      });
    } else {
      return 400;
    }
  });
  return 503;
}

// TODO - Implement
function displayGroupInfo(req, res) {

}

function getClientIp(req) {
  var ipAddress;
  // Amazon EC2 / Heroku workaround to get real client IP
  var forwardedIpsStr = req.header('x-forwarded-for'); 
  if (forwardedIpsStr) {
    // 'x-forwarded-for' header may return multiple IP addresses in
    // the format: "client IP, proxy 1 IP, proxy 2 IP" so take the
    // the first one
    var forwardedIps = forwardedIpsStr.split(',');
    ipAddress = forwardedIps[0];
  }
  if (!ipAddress) {
    // Ensure getting client IP address still works in
    // development environment
    ipAddress = req.connection.remoteAddress;
  }
  return ipAddress;
};
