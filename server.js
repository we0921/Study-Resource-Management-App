//jshint esversion:6

const { Client } = require('pg');
const client = new Client({
  user: 'dsaeotks',
  host: 'jelani.db.elephantsql.com',
  database: 'dsaeotks',
  password: '7jCyv7wSMTQOUTHTEsRNsvjOCOLSJ6h1',
  port: 5432,
});

client.connect();
const express = require("express");
const bodyParser = require("body-parser");
const session = require("express-session");
const socket = require("socket.io");
const app = express();

app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({extended: true}));
app.use(express.static(__dirname + "/public/"));
app.use(session({secret: 'ssshhhhhh'}));
const ejs = require("ejs");

// added server port
let port = process.env.PORT;
if (port == null || port == "") {
  port = 3000;
}
const server = app.listen(port, function() {
  console.log("Server has started on port 3000");
});
const io = socket(server);

// user login/register Page
app.get("/", (req, res) => {
  let login_reg_status = {
    status: "fine"
  };
  res.render("login", {status: JSON.stringify(login_reg_status)});
});

// user post request
app.post("/", (req, res) => {
  login_register(req, res);
});

app.get("/home", (req, res) => {
  const query = "SELECT * FROM users WHERE email = $1";
  const values = [req.session.email];
  client.query(query, values, (err, response) => {
    if (err) console.log(err);
    else {
      res.render("homePage", {user: JSON.stringify(response.rows[0])});
    }
  });
});

app.post("/home", (req, res) => {
  res.redirect("/group");
});

//group home page (currently make group page)
app.get("/group", (req, res) => {
  res.render("createGroup");
});
//make group post request
app.post("/group", (req, res) => {
    makeGroup(req, res);
});

app.get("/groupMenuPage", (req, res) => {
  const query = "SELECT * FROM group_ WHERE private = false";
  client.query(query, (err, response) => {
    if (err) console.log(err.stack);
    else {
      res.render("groupMenuPage", {groups: response.rows});
    }
  });
});

app.post("/groupMenuPage", (req, res) => {
  let id = req.body.group_id;

  res.redirect("/groupPage/" + id);
});
app.get("/groupPage/:groupID", (req, res) => {
  // save the group_id
  const groupID = req.url.split("/groupPage/")[1];
  let group, events, boards;

  // get the group info
  const query = "SELECT * FROM group_ WHERE group_id = $1";
  const values = [groupID];
  client.query(query, values, (err, response) => {
    if (err) console.log(err.stack);
    else {
      group = response.rows[0];

      // get the events
      const query2 = "SELECT * FROM event_ WHERE groupid = $1";
      client.query(query2, values, (err, response) => {
        if (err) console.log(err.stack);
        else {
          events = response.rows;

          // get the boards
          const query3 = "WITH boardTemp AS (" +
              "SELECT boardid FROM boardlist WHERE groupid = $1)" +
              "SELECT * FROM board natural join boardTemp";
          client.query(query3, values, (err, response) => {
            if (err) console.log(err.stack);
            else {
              boards = response.rows;

              const groupObj = {
                group: group,
                events: events,
                boards: boards
              };

              res.render("groupHomePage", {group: JSON.stringify(groupObj)});
            }
          });
        }
      });
    }
  });
});
// Send Notification API
// app.post('/createPost', (req, res) => {
//   const notify = {data: req.body};
//   socket.emit('notification', notify); // Updates Live Notification
//   res.send(notify);
// });
app.post("/groupPage/:groupID", (req, res) => {
  createPost(req, res);
});
//post request for creating new board
app.post("/addBoard",(req, res) => {
  createBoard(req, res);
});

// FUNCTIONS *********************************************************************
function login_register(req, res){
  // grad the login info
  let loginEmail = req.body.loginEmail;
  let loginPass = req.body.loginPassword;

  // grab the reg info
  let regEmail = req.body.registerEmail;
  let regPass = req.body.registerPassword;
  let first = req.body.first;
  let last = req.body.last;

  // did the user register?
  if (Object.keys(req.body).includes("registerBtn")){
    // create a query
    const query = "INSERT INTO users(email, password, first, last, bio, status, location, cubVotes) VALUES($1, $2, $3, $4, $5, $6, $7, $8)";
    const values = [regEmail, regPass, first, last, "", false, "", 0];

    // execute insertion
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
      // register succuessful
      else {
        let login_reg_status = {
          status: "register-success"
        };
        // send back to the login page
        res.render("login", {status: JSON.stringify(login_reg_status)});
      }
    });
  }
  // otherwise the user is trying to login
  else {
    const query = "SELECT email, password FROM users WHERE email = $1 AND password = $2";
    const values = [loginEmail, loginPass];

    client.query(query, values, (err, response) => {
      if (err) console.log(err.stack);
      else {
        if (response.rows.length == 0){
          let login_reg_status = {
            status: "login-fail"
          };
          res.render("login", {status: JSON.stringify(login_reg_status)});
        }
        else {
          req.session.email = loginEmail;
          res.redirect("/home");
        }
      }
    });
  }
}
function createPost(req, res) {
  let email = req.body.email;
  let pId = Math.floor(Math.random() * 100000000);
  let msg = req.body.message;
  let date = new Date;
  let time = date.getHours() + ":" + date.getMinutes() + ":" + date.getSeconds();
  let cubVotes = 0;
  let gId = req.body.groupID;
  const query = "INSERT INTO post(postid, postcontent, postowner, postdate, posttime, cubvotes) VALUES($1, $2, $3, $4, $5, $6)";
  const values = [pId, msg, email, date, time, cubVotes];

  client.query(query, values, (err, response) => {
    let bId = req.body.boardID;
    if (err) {
      console.log("create post error stack");
      console.log("------------------------------------------------------");
      console.log(err.stack);
      console.log("------------------------------------------------------");
    } else {
      const query = "INSERT INTO postlist(boardid, postid) VALUES($1, $2)";
      const values = [bId, pId];

      client.query(query, values, (err, response) => {
        if (err) {
          console.log("insert to postlist after post creation error stack");
          console.log("------------------------------------------------------");
          console.log(err.stack);
          console.log("------------------------------------------------------");
        } else {
          let newMessage = {
            message: msg,
            time: time,
            date: date
          }
          io.emit('post', newMessage);
          res.json(newMessage);
        }
      });
    }
  });

}
function makeGroup(req, res) {
  let gId = Math.floor(Math.random() * 100000000);
  let leaderEmail = req.session.email;
  let gDesc = req.body.groupDesc;
  let gName = req.body.groupName;
  let priv = false;

  //Creating new group
  const query = "INSERT INTO group_(group_id, leader, group_name, group_desc, private) VALUES($1, $2, $3, $4, $5)";
  const values = [gId, leaderEmail, gName, gDesc, priv];

  client.query(query, values, (err, response) => {

    //Group unsuccessfully created
    if (err) {
      console.log("makeGroup broke!");
      console.log("------------------------------------");
      console.log(err.stack)
      res.redirect("/group")
    } else {
      let joinDate = new Date;
      let inviteDate = joinDate;
      let status = true;
      const query = "INSERT INTO member_(email, groupid, status, joindate, invitedate) VALUES($1, $2, $3, $4, $5)";
      const values = [leaderEmail, gId, status, joinDate, inviteDate];

      client.query(query, values, (err, response) => {
        if (err) {
          console.log("makeGroup broke! again");
          console.log(err.stack);
          const query = 'DELETE FROM "group_" WHERE ' +
              '"group_id" = $1, ' +
              '"leader" = $2, ' +
              '"group_name" = $3, ' +
              '"group_desc" = $4, ' +
              '"private" = $5';
          const values = [leaderEmail, gId, status, joinDate, inviteDate];
          try {
            client.query(query, values);
          } catch (e) {
            console.log(e.stack);
          }
        } else {
          res.redirect("/home");
        }
      });
    }
  });
}
function joinGroup(req, res) {
  let gId = req.body.groupId;
  let email = req.session.email;
  let status = true;
  let jdate = new Date();
  let idate = jdate;

  const query = "INSERT INTO member_(email, groupid, status, joindate, invitedate) VALUES($1, $2, $3, $4, $5)";
  const values = [email, gId, status, jdate, idate];

  try {
    client.query(query, values);
  } catch (e) {
    console.log("---------------------------Join Group error stack------------------------------");
    console.log(e.stack);
  }
}
function createBoard(req, res) {
  let bId = Math.floor(Math.random() * 100000000);
  let bName = req.body.boardName;
  let bDesc = req.body.boardDesc;

  //inserting new board into database
  const query = "INSERT INTO board(boardid, boardname, boarddesc) VALUES($1, $2, $3)";
  const values = [bId, bName, bDesc];
  console.log("-----values for board-----");
  console.log(bId);
  console.log(bName);
  console.log(bDesc);
  console.log("---------------------------");
  client.query(query, values, (err, response) => {
    if (err) {
      console.log("------------------------Board Creation Error Stack--------------------");
      console.log(err.stack);
    } else {
      console.log(req.body);
      let gId = req.body.groupID;
      console.log(gId);
      //creating tuple for board in boardlist
      const query = "INSERT INTO boardlist(boardid, groupid) VALUES($1, $2)";
      const values = [bId, gId];

      client.query(query, values, (err, response) => {
        if (err) {
          console.log("------------------------BoardList Creation Error Stack--------------------");
          console.log(err.stack);
        }
        else {
          res.redirect("/groupPage/" + gId);
        }
      });
    }
  });
}