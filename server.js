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
const session = require("express-session");
const socket = require("socket.io");
const app = express();
const uid = require('uid-safe');

app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({extended: true}));
app.use(express.static(__dirname + "/public/"));
const ejs = require("ejs");
const Console = require("console");

// Add server port
let port = process.env.PORT;
if (port == null || port === "") {
  port = 3000;
}
const server = app.listen(port, function() {
  console.log("Server has started on port 3000");
});
//const io = socket(server);

// ######################################################
// #              SERVER ROUTES BELOW                   #
// ######################################################

// LOGIN/REGISTER ROUTES
//   Display login page
app.get("/", (req, res) => {
  let login_reg_status = {
    status: "fine"
  };
  res.render("login");
  //res.render("login", {status: JSON.stringify(login_reg_status)});
});
//   User login
app.post("/login", async (req, res) => {
  await login(req, res);
});
//   User registration
app.post("/register", async (req, res) => {
  await register(req, res);
});

// USER HOME PAGE ROUTE
// Show the user home page
app.get("/home", async (req, res) => {
  let cookies = cookieParser(req);
  let authResult = await authenticate(cookies["email"], cookies["session"], req.ip);

  if (authResult === false) {
    // Invalid session => Back to login
    res.clearCookie("email");
    res.clearCookie("session");
    res.redirect("/");
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
                console.log(obj);
                res.render("homePage", {sObj: JSON.stringify(obj), obj: obj, email: cookies["email"]});
              }
            });
          }
        });
      }
    });
  }
});

// Create group post request
app.post("/group", async (req, res) => {
  let cookies = cookieParser(req);
  let authResult = await authenticate(cookies["email"], cookies["session"], req.ip);

  if (authResult === false) {
    // Invalid session => Back to login
    res.clearCookie("email");
    res.clearCookie("session");
    res.redirect("/");
  } else {
    let leader = cookies["email"];
    let desc = req.body.groupDesc;
    let name = req.body.groupName;
    let isPrivate = (req.body.btnradio === "true");
    let tag = req.body.tag;
    let pic = req.body.grouppic;

    await createGroup(leader, name, desc, isPrivate, tag, pic);
  }
});

// JOIN GROUP PAGE ROUTES
//    Show the groups a user can join
app.get("/groupMenuPage", async (req, res) => {
  let cookies = cookieParser(req);
  let authResult = await authenticate(cookies["email"], cookies["session"], req.ip);

  if (authResult === false) {
    // Invalid session => Back to login
    res.clearCookie("email");
    res.clearCookie("session");
    res.redirect("/");
  } else {
    const query = "WITH temptable AS(SELECT * FROM group_ join users on group_.leader = users.email NATURAL JOIN grouptags WHERE private = false) " +
          " SELECT * FROM temptable LEFT JOIN grouppictures gp USING(groupid)";
    client.query(query, (err, response) => {
      if (err) console.log(err.stack);
      else {
        res.render("groupMenuPage", {groups: response.rows});
      }
    });
  }
});
//    Join a group and enter their page
app.post("/groupMenuPage", async (req, res) => {
  let cookies = cookieParser(req);
  let authResult = await authenticate(cookies["email"], cookies["session"], req.ip);

  if (authResult === false) {
    // Invalid session => Back to login
    res.clearCookie("email");
    res.clearCookie("session");
    res.redirect("/");
  } else {
    let groupID = req.body.group_id;
    let joinResult = await joinGroup(cookies["email"], groupID);
    if (joinResult) {
      res.status(200).redirect("/group/" + groupID);
    } else {
      res.status(400);
    }
  }
});

// Create a group
app.post("/createGroup", async (req, res) => {
    let cookies = cookieParser(req);
    let authResult = await authenticate(cookies["email"], cookies["session"], req.ip);

    if (authResult === false) {
      // Invalid session => Back to login
      res.clearCookie("email");
      res.clearCookie("session");
      res.redirect("/");
    } else {
      let createGroupRes = await createGroup(cookies["email"], req.body.groupName, req.body.groupDesc, (req.body.btnradio === "true"), req.body.tag, req.body.grouppic);
      if (createGroupRes.created === false) {
        res.status(503).redirect("/home");
      } else {
        res.status(200).redirect("/group/" + createGroupRes.boardid);
      }
    }
  });

//  Display the group page
app.get("/groupPage/:groupID", async (req, res) => {
  let cookies = cookieParser(req);
  let authResult = await authenticate(cookies["email"], cookies["session"], req.ip);

  if (authResult === false) {
    // Invalid session => Back to login
    res.clearCookie("email");
    res.clearCookie("session");
    res.redirect("/");
  } else {
    // Variable declarations
    let groupInfo, events, boards, tags;

    // Determine if the user is in the group
    const query = "SELECT * from member_ WHERE email = $1 AND groupid = $2 AND banned = false";
    const values = [cookies["email"], req.params["groupID"]];

    client.query(query, values, (err, response) => {
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
            if (err) printError(err, "Error retrieving group info (001)")
            else {
              groupInfo = response.rows[0];

              // Fetch events
              const query2 = "SELECT * FROM event WHERE groupid = $1";
              client.query(query2, values, (err, response) => {
                if (err) printError(err, "Error retrieving events (002)")
                else {
                  events = response.rows;

                  // Fetch boards
                  const query3 = "SELECT * from board natural join boardlist WHERE groupid = $1"
                  client.query(query3, values, (err, response) => {
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
});

//  Create a post
app.post("/createPost", async (req, res) => {
  let cookies = cookieParser(req);
  let authResult = await authenticate(cookies["email"], cookies["session"], req.ip);

  if (authResult === false || req.body.email !== cookies["email"]) {
    // Invalid session => Back to login
    res.clearCookie("email");
    res.clearCookie("session");
    res.status(401).redirect("/");
  } else {
    createPost(req, res);
  }
});

//  Delete a post
app.post("/deletePost", async (req, res) => {
  let cookies = cookieParser(req);
  let authResult = await authenticate(cookies["email"], cookies["session"], req.ip);

  if (authResult === false) {
    // Invalid session => Back to login
    res.clearCookie("email");
    res.clearCookie("session");
    res.status(401).redirect("/");
  } else {
    // Verify the user matches
    if (req.body.userID === cookies["email"]) {
      deletePost(req, res);
    } else res.status(401);
  }
});

app.get("/groupBoardPage/:groupID/:boardID", async (req, res) => {
  let cookies = cookieParser(req);
  let authResult = await authenticate(cookies["email"], cookies["session"], req.ip);

  if (authResult === false) {
    // Invalid session => Back to login
    res.clearCookie("email");
    res.clearCookie("session");
    res.status(401).redirect("/");
  } else {
    res.redirect("/groupPage/" + req.params["groupID"] + "/groupBoardPage/" + req.params["boardID"]);
  }
});

// get request for displaying board and posts page
app.get("/groupPage/:groupID/groupBoardPage/:boardID", async (req, res) => {
  let cookies = cookieParser(req);
  let authResult = await authenticate(cookies["email"], cookies["session"], req.ip);

  if (authResult === false) {
    // Invalid session => Back to login
    res.clearCookie("email");
    res.clearCookie("session");
    res.status(401).redirect("/");
  } else {
    displayBoard(req, res, req.params["boardID"], req.params["groupID"], cookies["email"]);
  }
});

// Create a new board
app.post("/addBoard", async (req, res) => {
  let cookies = cookieParser(req);
  let authResult = await authenticate(cookies["email"], cookies["session"], req.ip);

  if (authResult === false) {
    // Invalid session => Back to login
    res.clearCookie("email");
    res.clearCookie("session");
    res.status(401).redirect("/");
  } else {
    createBoard(req, res);
  }
});

// Delete a board
app.post("/deleteBoard", async (req, res) => {
  let cookies = cookieParser(req);
  let authResult = await authenticate(cookies["email"], cookies["session"], req.ip);

  if (authResult === false) {
    // Invalid session => Back to login
    res.clearCookie("email");
    res.clearCookie("session");
    res.status(401).redirect("/");
  } else {
    let groupID = req.body.groupID;
    let boardID = req.body.boardID;

    deleteBoard(groupID, boardID, cookies["email"], res);
  }
})

// TODO - Doesn't make sense? Is this a user accepting a group invite? Figure out those two mystery lines
//post request handling for giving a user a group invite
app.post("/groupInviteUser", async (req, res) => {
  let cookies = cookieParser(req);
  let authResult = await authenticate(cookies["email"], cookies["session"], req.ip);

  if (authResult === false) {
    // Invalid session => Back to login
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
      // What do these two lines do?
      req.body.userEmail = userEmail;
      req.body.inviteEmail = inviteEmail;
      res.redirect("/groupPage/" + groupID);
    }
  }
});

// TODO - Figure out those two mystery lines
//  get request handling for returning a notification for a group invite for a user
app.get("/groupPage/:groupID", async (req, res) => {
  let cookies = cookieParser(req);
  let authResult = await authenticate(cookies["email"], cookies["session"], req.ip);

  if (authResult === false) {
    // Invalid session => Back to login
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
});

// Add or remove a vote for a post
app.post("/cubvotePost", async (req, res) => {
  let cookies = cookieParser(req);

  // Run the authentication routine
  let authResult = await authenticate(cookies["email"], cookies["session"], req.ip);

  // Make sure that the email in the req body is the same as the one stored in cookies
  if (authResult === false || req.body.userID !== cookies["email"]) {
    // Invalid session => Back to login
    res.clearCookie("email");
    res.clearCookie("session");
    res.status(401).redirect("/");
  } else {
    // Add/remove the vote to the post
    changePostVote(req, res);
  }
});

// Invite a user to an event
app.post("/eventInviteUser", async (req, res) => {
  let cookies = cookieParser(req);
  let authResult = await authenticate(cookies["email"], cookies["session"], req.ip);

  if (authResult === false || req.body.userEmail !== cookies["email"]) {
    // Invalid session => Back to login
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
});

// Create an event
app.post("/createEvent", async (req, res) => {
  let cookies = cookieParser(req);
  let authResult = await authenticate(cookies["email"], cookies["session"], req.ip);

  if (authResult === false) {
    // Invalid session => Back to login
    res.clearCookie("email");
    res.clearCookie("session");
    res.status(401).redirect("/");
  } else {
    createEvent(cookies["email"], req.body.eventName, req.body.eventDesc, req.body.datetimes, req.body.eGroupID, res);
  }
});

// Display event
app.get("/eventHomePage/:eventID", async (req, res) => {
  let cookies = cookieParser(req);
  let authResult = await authenticate(cookies["email"], cookies["session"], req.ip);

  if (authResult === false) {
    // Invalid session => Back to login
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
});

// Allows the leader to add a tag to a group
app.post("/addGroupTag", async (req, res) => {
  let cookies = cookieParser(req);
  let authResult = await authenticate(cookies["email"], cookies["session"], req.ip);

  if (authResult === false) {
    // Invalid session => Back to login
    res.clearCookie("email");
    res.clearCookie("session");
    res.status(401).redirect("/");
  } else {
    const query = "SELECT leader FROM group_ WHERE groupid = $1";
    client.query(query, [req.body.groupID], async (err, response) => {
      if (err) {
        printError(err, "Error validating leader");
        res.status(403);
      }
      if (response.rows.length !== 0) {
        if (response.rows[0].leader === cookies["email"]) {
          let statusCode = await addGroupTag(req.body.tagName, req.body.groupID);
          res.status(statusCode);
        } else {
          res.status(403);
        }
      } else {
        res.status(404);
      }
    });
  }
});

// Create a tag
// - I'm not sure when this happens?
// TODO - Add leader verification like in the route above?
app.post("/createTag", async (req, res) => {
  let cookies = cookieParser(req);
  let authResult = await authenticate(cookies["email"], cookies["session"], req.ip);

  if (authResult === false) {
    // Invalid session => Back to login
    res.clearCookie("email");
    res.clearCookie("session");
    res.status(401).redirect("/");
  } else {
    let result = await createTag(req.body.groupID, req.body.tagname);
    res.status(result);
  }
});

// !!!!!!!!!!!!!!!!!!!!!!!!!!!!! INVITE PAGE RELATED GET AND POST ROUTES !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
//invite page for the user
app.get("/invites", async (req, res) => {
  let cookies = cookieParser(req);
  let authResult = await authenticate(cookies["email"], cookies["session"], req.ip);

  if (authResult === false) {
    // Invalid session => Back to login
    res.clearCookie("email");
    res.clearCookie("session");
    res.status(401).redirect("/");
  } else {
    showInvites(cookies["email"], res);
  }
});

// Accept group invitation
app.get("/joinGroup/:groupID", async (req, res) => {
  let cookies = cookieParser(req);
  let authResult = await authenticate(cookies["email"], cookies["session"], req.ip);

  if (authResult === false) {
    // Invalid session => Back to login
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
      }
      else res.status(200).redirect("/invites");
    });
  }
});

// Decline group invitation
app.get("/declineGroup/:groupID", async (req, res) => {
  let cookies = cookieParser(req);
  let authResult = await authenticate(cookies["email"], cookies["session"], req.ip);

  if (authResult === false) {
    // Invalid session => Back to login
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
});

// Accept event invitation
app.get("/joinEvent/:eventID", async (req, res) => {
  let cookies = cookieParser(req);
  let authResult = await authenticate(cookies["email"], cookies["session"], req.ip);

  if (authResult === false) {
    // Invalid session => Back to login
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
});
// Decline event invitation
app.get("/declineEvent/:eventID", async (req, res) => {
  let cookies = cookieParser(req);
  let authResult = await authenticate(cookies["email"], cookies["session"], req.ip);

  if (authResult === false) {
    // Invalid session => Back to login
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
});

app.post("groupInfoPage", async (req, res) => {
  let cookies = cookieParser(req);
  let authResult = await authenticate(cookies["email"], cookies["session"], req.ip);

  if (authResult === false) {
    // Invalid session => Back to login
    res.clearCookie("email");
    res.clearCookie("session");
    res.status(401).redirect("/");
  } else {
    let gId = req.body.groupID;
    res.redirect("groupPage/" + gId + "/groupInfo");
  }
});

app.get("groupPage/:groupID/groupInfo", async (req, res) => {
  let cookies = cookieParser(req);
  let authResult = await authenticate(cookies["email"], cookies["session"], req.ip);

  if (authResult === false) {
    // Invalid session => Back to login
    res.clearCookie("email");
    res.clearCookie("session");
    res.status(401).redirect("/");
  } else {
    displayGroupInfo(req, res);
  }
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
async function authenticate(email, sessionid, IP) {
    let values = [email, sessionid, IP];
    console.log("Email: " + values[0]);
    console.log("sessionid: " + values[1]);
    console.log("IP: " + values[2]);
    let query = "SELECT * FROM session where email = $1 AND id = $2 AND ip = $3";

    client.query(query, values, (err, response) => {
      if (err) {
        printError(err, "Unable to query when authenticating " + email);
      } else
        console.log("HELLO?");
        response.rows.forEach((row) => {
          console.log("row: " + row.toString());
        });

      let date = new Date(Date.now());

      if (response.rows.length === 0) {
        console.log("Returning false");
        return false;
      } else {
        console.log("Returning " + (response.rows[0].expires <= date.toISOString()) ? "true" : "false");
        return (response.rows[0].expires <= date.toISOString());
      }
    });
  }

// [DONE] User login and registration functions
async function login(req, res) {
  // Grab the values
  let loginEmail = req.body.loginEmail;
  let loginPass = req.body.loginPassword;

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
        // User exists in the database
        // => Delete any sessions with the current IP address
        const query = "DELETE FROM session WHERE ip = $1 AND email = $2";
        const values = [req.ip, loginEmail];

        client.query(query, values, async (err, response) => {
          if (err) {
            printError(err, "2");
          } else {
            // Create a new session for this login
            let sessionID = await uid(18).then((e) => {
              return e;
            });

            const query = "INSERT INTO session VALUES($1, $2, $3, to_timestamp($4), to_timestamp($5))";
            const values = [req.ip, sessionID, loginEmail, (Date.now() / 1000), (Date.now() / 1000) + 1209600];

            console.log(req.ip);

            // Store the session in the database
            client.query(query, values, (err, response) => {
              if (err) {
                printError(err, "3");
              } else {
                // Successfully stored in database => store as cookie
                res.cookie("session", sessionID, {expires: new Date(Date.now() + 1209600000), secure: true});
                res.cookie("email", loginEmail, {secure: true});
                /*app.use(session({
                  secret: "z$C&F)J@NcRfUjXnZr4u7x!A%D*G-KaPdSgVkYp3s5v8y/B?E(H+MbQeThWmZq4t7w9z$C&F)J@NcRfUjXn2r5u8x/A%D*G-KaPdSgVkYp3s6v9y$B&E(H+MbQeThWmZq4t7w!z%C*F-JaNcRfUjXn2r5u8x/A?D(G+KbPeSgVkYp3s6v9y$B&E)H@McQfTjWmZq4t7w!z%C*F-JaNdRgUkXp2r5u8x/A?D(G+KbPeShVmYq3t6v9y$B&E)H@McQ",
                  name: "session",
                  genid: () => {
                    return sessionID;
                  }
                }));*/

                // Redirect to the home page
                console.log("about to send session!: " + sessionID);
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
    const query = "INSERT INTO users (email, password, first, last, bio, status, location) VALUES($1, $2, $3, $4, $5, $6, $7, $8)";
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

// [DONE?] TODO - verify queries work as intended
// Displays the posts for a given board in a given group
function displayBoard(req, res, boardID, groupID, email) {
  // Variable declarations
  let groupInfo, boardInfo, postData;
  let postScores = new Map(), userInfo = [];

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
            const query = "WITH queryone AS ("
                        + "SELECT postid, COUNT(*) as postvotes "
                        + "FROM post NATURAL JOIN postlist NATURAL JOIN cubvoted "
                        + "WHERE boardid = $1 "
                        + "GROUP BY postid )"/*, "
                        + "querytwo AS ("
                        + "SELECT postid, 0 "
                        + "FROM post NATURAL JOIN postlist "
                        + "WHERE postid NOT IN (SELECT postid FROM cubvoted) AND "
                        + "boardid = $1) "*/
                        + "SELECT * FROM "
                        + "queryone;"
            /*const query = "SELECT postid, posttime, postdate, COUNT(*) as postvotes "
                        + "FROM cubvoted NATURAL JOIN post NATURAL JOIN postlist "
                        + "WHERE boardid = $1 "
                        + "GROUP BY postid, posttime, postdate "
                        + "ORDER BY postdate ASC, posttime ASC "
                        + "UNION "
                        + "SELECT postid, posttime, postdate, 0 "
                        + "FROM post NATURAL JOIN postlist "
                        + "WHERE boardid = $1 "
                        + "AND postid NOT IN (SELECT postid FROM cubvoted) "
                        + "ORDER BY postdate ASC, posttime ASC;";*/
            const values = [boardID];
            client.query(query, values, (err, response) => {
              if (err) {
                printError(err, "Error getting post scores")
              } else {
                // Build postScores

                console.log(response.rows.length);
                console.log(response.rows[0]);

                response.rows.forEach((r) => {
                  postScores.set(r.postid, r.postvotes);
                  //console.log("r: " + r);
                  //postScores[String(r.postid)] = r.postvotes;
                });

                console.log(postScores);

                const query = "SELECT postowner, first, last, COUNT(*) as uservotes, postid, postcontent, postdate, posttime "
                            + "FROM cubvoted NATURAL JOIN postlist NATURAL JOIN post JOIN users "
                            + "ON users.email = post.postowner "
                            + "WHERE boardid = $1 "
                            + "GROUP BY postowner, users.first, users.last, cubvoted.postid, post.postcontent, post.postdate, post.posttime "
                            + "ORDER BY postdate ASC, posttime ASC; "
                client.query(query, [boardID], (err, response) => {
                  if (err) {
                    printError(err, "Error retrieving user scores");
                  } else {
                    //console.log(response);
                    // Build userScores
                    /*response.rows.forEach((r) => {
                      console.log(r);
                      userInfo[r.postowner] = r.uservotes;
                    })*/
                    userInfo = response.rows;
                    console.log(userInfo);

                    let combinedPostScoreData = [];
                    let index = 0;
                    userInfo.forEach((d) => {
                      combinedPostScoreData[index] = {
                        email: d.postowner,
                        first: d.first,
                        last: d.last,
                        uservotes: d.uservotes,
                        postid: d.postid,
                        postcontent: d.postcontent,
                        postdate: d.postdate,
                        posttime: d.posttime,
                        postvotes: postScores.get(d.postid)
                      }
                      index = index + 1;
                    });

                    console.log(combinedPostScoreData);

                    let returnData = {
                      email: email,
                      groupInfo: groupInfo,
                      boardInfo: boardInfo,
                      posts: combinedPostScoreData
                    }
                    res.render("groupBoardPage", {data: JSON.stringify(returnData)});
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

// [DONE?] TODO - fix postid generation. This is not a good solution. Firstname.first? gID never used?
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
  let gId = req.body.groupID;
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
              console.log("postListQuery DONE");
              //putting post information into object
              let newPost = {
                first: firstname,
                last: lastname,
                message: msg,
                time: time,
                date: date
              }
              //sending post to any user currently using the homepage
              //io.emit('post', newMessage);
              //sending object back to user
              res.status(200).json(newPost);
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
  let boardID = req.body.boardID;

  // Verify that the user is in the group and is capable of deleting the
  const query = "SELECT email "                         // 1)
      + "FROM member_ join post "
      + "ON member_.email = post.postowner"
      + "WHERE groupid = $1 AND email = $2" +
      +"UNION "
      + "SELECT leader as email "               // 2)
      + "FROM group_ "
      + "WHERE groupid = $1"
      + "UNION "
      + "SELECT email "                         // 3)
      + "FROM member_ "
      + "WHERE moderator = true";

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
                    res.status("200");
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

// Create a group using the parameters giving
// Generates the group id and returns an object like so
// {created: [true/false], groupid: [group id]}
// [DONE?] TODO - Fix groupid generation
async function createGroup(leader, name, desc, isPrivate, tag, pic) {
  let groupid = Math.floor(Math.random() * 100000000);

  // Create the group in the database
  const query = "INSERT INTO group_(groupid, leader, groupname, groupdesc, private) VALUES($1, $2, $3, $4, $5)";
  const values = [groupid, leader, name, desc, isPrivate];

  client.query(query, values, (err, response) => {
    // If the group isn't successfully made
    if (err) {
      printError(err, "Error creating group (001)");
      return {created: false, groupid: null};
    } else {
      // insert user into the member table
      const query = "INSERT INTO member_(email, groupid, status, joindate, invitedate) VALUES($1, $2, $3, $4, $5)";
      const values = [leader, groupid, true, new Date, new Date];
      client.query(query, values, (err, response) => {
        // Failed member insertion fallback
        if (err) {
          printError(err, "Error inserting member (002)");

          // Delete the group
          const query = 'DELETE FROM "group_" WHERE ' +
              '"groupid" = $1, ' +
              '"leader" = $2, ' +
              '"groupname" = $3, ' +
              '"groupdesc" = $4, ' +
              '"private" = $5';
          const values = [groupid, leader, name, desc, isPrivate];
          try {
            client.query(query, values);
          } catch (e) {
            printError(err, "Error deleting group (003)")
          }
          // Successful member insertion
        } else {
          // insert group and tag into grouptags
          const query = "INSERT INTO grouptags (groupid, tagname) VALUES ($1, $2)";
          const values = [groupid, tag];
          client.query(query, values, (err, response) => {
            if (err) printError(err, "Error inserting tag to list (004)")
            else {
              // insert group photo url into grouppics
              const query = "INSERT INTO grouppicture (groupid, pic) VALUES ($1, $2)";
              const values = [groupid, pic];
              client.query(query, values, (err, response) => {
                if (err) printError("Error adding picture to group (005)");
                else {
                  return {created: true, groupid: groupid};
                }
              });
            }
          });
        }
      });
    }
  });
  return {created: false, groupid: groupid};
}

// [DONE]
async function joinGroup(email, groupID) {
  let date = new Date();

  const query = "INSERT INTO member_(email, groupid, status, joindate, invitedate) VALUES($1, $2, $3, $4, $4)";

  client.query(query, [email, groupID, true, date], (err, response) => {
    if (err) {
      printError(err, "Error joining group");
      return false;
    } else {
      return true;
    }
  });
  return false;
}

// [DONE] TODO - Fix boardid generation
function createBoard(req, res) {
  let boardID = Math.floor(Math.random() * 100000000);
  let boardName = req.body.boardName;
  let boardDesc = req.body.boardDesc;
  let groupID = req.body.groupID;

  // Insert new board into board table
  const query = "INSERT INTO board (boardid, boardname, boarddesc) VALUES($1, $2, $3)";
  const values = [boardID, boardName, boardDesc];
  client.query(query, values, (err, response) => {
    if (err) {
      printError(err, "Error inserting board (001)");
      res.status(503);
    } else {
      // Insert into boardlist table
      const query = "INSERT INTO boardlist(boardid, groupid) VALUES($1, $2)";
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
  let sId = req.session.email;

  if (userEmail === sId) {
    let status = false;
    let inviteDate = new Date;

    // Check if the sender is in the group they're trying to invite someone to
    let query = "SELECT email "
        + "FROM member_ "
        + "WHERE groupid = $1 AND email = $2";
    client.query(query, [groupID, userEmail], (err, response) => {
      if (err) printError(err, "email: " + userEmail + ", groupID: " + groupID + " => could not query for email in members_ table with previous values");
      else if (response.rows.length !== 0) {
        // The user inviting the person IS in the group

        // Put the invitee in the member_ table
        let query = "INSERT INTO member_ VALUES($1, $2, $3, $4, $4, $6, $6)";
        let values = [inviteEmail, groupID, status, inviteDate, false];
        client.query(query, values, (err, response) => {
          if (err) printError(err, "User: " + inviteEmail + "=> cannot be insert into member_ table");
          else {
            let query = "SELECT groupname "
                + "FROM group_ "
                + "WHERE groupid = $1";
            client.query(query, [groupID], (err, response) => {
              if (err) printError(err, "groupid: " + groupID + " => not in group_ table");
              else {
                let groupname = response.rows[0];
                let invObj = {
                  type: "groupInvite",
                  groupName: groupname,
                  groupID: groupID,
                  inviteDate: inviteDate
                }

                //console.log("1111+++++++++++=111+++++++++++++");
                //console.log("I AM ABOUT TO SEND AN INVITE TO " + inviteEmail);
                //console.log("1111+++++++++++=111+++++++++++++");
                //sending notification to invited user
                //io.sockets.in(inviteEmail).emit('invitedToGroup', invObj);

                //notifying user that a request was sent to the invited user
                let data = {requestSent: true}
                res.json(data);
              }
            });
          }
        });
      }
    });
  } else {
    console.log("Invalid Invite Request:");
    res.status(403);
  }
}

// [DONE?] TODO - fix eventID generation
function createEvent(email, eventName, eventDesc, time, groupID, res) {
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
          res.status(200).redirect("/groupPage/" + groupID);
        }
      });
    } else {
      res.status(403);
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

  console.log("changePostVote email: " + email);

  // Check if user has already voted
  let query =
      "SELECT * " +
      "FROM cubvoted " +
      "WHERE email = $1 AND postid = $2";
  client.query(query, [email, postid], (err, response) => {
    if (err) {
      printError(err, "Error retrieving vote status (001)");
    } else {
      //User didn't upvote, insert their vote into cubvoted
      if (response.rows.length === 0) {
        console.log("USER DIDNT UPVOTE");
        let query =
            "INSERT INTO cubvoted (postid, email) VALUES($1, $2)";
        client.query(query, [postid, email], (err, response) => {
          if (err) {
            printError(err, "Error adding vote (002)");
            res.status(400);
          } else {
            res.status(200); //.send({cubvote: true});
          }
        });
      } else {
        console.log("USER ALREADY VOTED");
        // User has already voted, delete their vote from cubvoted
        query = "DELETE FROM cubvoted WHERE postid = $1 AND email = $2";
        client.query(query, [postid, email], (err, response) => {
          if (err) {
            printError(err, "Error removing vote for post")
          } else {
            res.status(201); //.send({cubvote: false});
          }
        });
      }
    }
  });
  res.status(403); //.send({cubvote: false});
}

// [DONE] Inserts a tag into the tag table and adds it to the group
async function createTag(tagName, groupID) {

  let query = "INSERT INTO tag (tagname) VALUES($1) "
  client.query(query, [tagName], async (err, response) => {
    if (err) {
      printError(err, "Error inserting tag");
      return 500;
    } else {
      return await addGroupTag(tagName, groupID);
    }
  });
  return 500;
}

// [DONE] Adds a tag to a group
async function addGroupTag(groupTag, groupID) {
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