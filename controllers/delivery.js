
require('dotenv').config();
const mysql = require('mysql2');

//database connection
const pool = mysql.createPool({
  host: process.env.HOST,
  user: process.env.USER,
  password: process.env.PASSWORD,
  database: process.env.DATABASE,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});


// Corrected and separated delete functions
function deleteRowByAccountId(connection, account_id) {
  const sql = "DELETE FROM delivery_account WHERE account_id = ?";
  connection.query(sql, [account_id], (err, result) => {
    if (err) {
      console.error("Error in deleting row by account_id:", err);
    } else {
      console.log(account_id + " row deleted");
    }
  });
}

function deleteRowByDeliveryId(connection, delivery_id) {
  const sql = "DELETE FROM delivery_account WHERE delivery_id = ?";
  connection.query(sql, [delivery_id], (err, result) => {
    if (err) {
      console.error("Error in deleting row by delivery_id:", err);
    } else {
      console.log(delivery_id + " row deleted");
    }
  });
}

// Corrected payPendingPayment function
function payPendingPayment(connection, account_id, newRemainingBill) {
  const sql = "UPDATE delivery_account SET remaining_bill = ? WHERE account_id = ?";
  connection.query(sql, [newRemainingBill, account_id], (err, result) => {
    if (err) {
      console.error("Error updating remaining bill:", err);
    } else {
      console.log("Remaining bill updated for account_id: " + account_id);
    }
  });
}

// Corrected update_payment_status function
const update_payment_status = (req, res) => {
  const { delivery_id, cust_mobile, db_mobile, payment_mode, bill, paid_amount } = req.body.paymentDetails;

  const sql = "UPDATE delivery SET payment_verify = '1' WHERE delivery_id = ?";
  pool.getConnection((error, connection) => {
    if (error) {
      console.error("Error getting connection:", error);
      return;
    }

    connection.query(sql, [delivery_id], (err, result) => {
      if (err) {
        console.error("Error updating delivery:", err);
        return;
      }

      if (result.affectedRows > 0) {

        // Logic for handling payments and remaining bills
        if (paid_amount > bill) {
          let extra_amount = paid_amount - bill;
          deleteRowByDeliveryId(connection, delivery_id);

          const sql1 = "SELECT account_id, remaining_bill FROM delivery_account WHERE cust_mob = ?";
          connection.query(sql1, [cust_mobile], (err, delivery_account_result) => {
            if (err) {
              console.error("Error querying delivery_account:", err);
              return;
            }

            if (delivery_account_result.length > 0) {
              delivery_account_result.forEach(delivery_account => {
                let { account_id, remaining_bill } = delivery_account;
                if (extra_amount > 0) {
                  if (extra_amount >= remaining_bill) {
                    deleteRowByAccountId(connection, account_id);
                    extra_amount -= remaining_bill;
                  } else {
                    let newRemainingBill = remaining_bill - extra_amount;
                    payPendingPayment(connection, account_id, newRemainingBill);
                    extra_amount = 0;
                  }
                }
              });
            }
          });
        } else {
          let newRemainingBill = bill - paid_amount;
          const sql2 = "UPDATE delivery_account SET remaining_bill = ? WHERE delivery_id = ?";
          connection.query(sql2, [newRemainingBill, delivery_id], (err) => {
            if (err) {
              console.error("Error updating remaining bill:", err);
            } else {
              console.log("Remaining bill updated for delivery_id: " + delivery_id);
            }
          });
        }
      }
    });
  });
};



// fucntion for payment varification table
// function for payment verification table
const unverified_delivery = (req, res) => {
  const sql = "SELECT * FROM delivery WHERE payment_verify = '0'";

  pool.getConnection((error, connection) => {
    connection.query(sql, (err, result) => {
      if (err) {
        console.error('Error executing SQL query:', err);
        connection.release();
        return res.status(500).json({ message: 'Internal server error' });
      }

      if (result.length > 0) {
        res.json(result);
      } else {
        res.json({ message: 'customer not found' });
      }
      connection.release(); // Release the database connection
    });
  });
}


const delivery_done = (req, res) => {
  const { mobile, db_mobile, pay_method, bill, payable_amount } = req.body.cloth_details;
  console.log(req.body.cloth_details);

  const sql = 'INSERT INTO delivery (cust_mobile, db_mobile, payment_mode, bill, paid_amount, payment_verify, time) VALUES (?, ?, ?, ?, ?, "0", NOW())';

  pool.getConnection((error, connection) => {
    if (error) {
      console.error('Error getting connection:', error);
      return res.status(500).json({ message: 'Error getting database connection' });
    }

    // Insert delivery data
    connection.query(sql, [mobile, db_mobile, pay_method, bill, payable_amount], (err, result) => {
      if (err) {
        console.error('SQL query error:', err);
        connection.release();
        return res.status(500).json({ message: 'Error executing SQL query' });
      } else {
        // Get the last inserted delivery_id
        const lastId = result.insertId; // Assuming `result.insertId` contains the last inserted ID in the 'delivery' table

        const sql1 = "INSERT INTO delivery_account (delivery_id, cust_mob, db_mobile, remaining_bill) VALUES (?, ?, ?, ?)";

        // Insert into delivery_account
        connection.query(sql1, [lastId, mobile, db_mobile, bill], (err, result1) => {
          if (err) {
            console.error('SQL query error:', err);
            connection.release();
            return res.status(500).json({ message: 'Error executing SQL query for updating' });
          }

          // Update delivery_status in orders table
          const sql2 = "UPDATE orders SET delivery_status = '1' WHERE cust_mobile=? AND db_mobile = ?";
          connection.query(sql2, [mobile, db_mobile], (err, result2) => {
            connection.release(); // Release the connection, even in case of an error

            if (err) {
              console.error('SQL query error:', err);
              return res.status(500).json({ message: 'Error executing SQL query for updating' });
            }
            return res.status(200).json({ message: 'Data inserted and delivery status updated successfully' });
          });
        });
      }
    });
  });
};




const fetch_delivery_details = (req, res) => {
  const delivery_details = req.body.delivery_details;
  console.log(delivery_details)

  const cust_mobile = delivery_details.mobile
  console.log(cust_mobile);
  const sql = `select bill from orders where cust_mobile = ? and delivery_status= '0'`;

  pool.getConnection((err, connection) => {
    if (err) {
      console.error('Error getting a database connection:', err);
    } else {
      console.log("connectionn successful");
      connection.query(sql, [delivery_details.mobile], (error, result) => {
        if (result.length > 0) {
          return res.json(result);
        }
        else {
          return res.json({ message: 'customer not find' })
        }
      });
    }
  });
}


const welcome = (req, res) => {
  res.send("Welcome to the delivery route");
}

const generateOtp = () => {
  return Math.floor(1000 + Math.random() * 9000); // Generate 4 digit OTP
};

const submitform = (req, res) => {
  const { mobile } = req.body;

  // Generate 4 digit random num
  const otp = generateOtp();
  console.log(`OTP for mobile ${mobile}: ${otp}`);

  // Send OTP back in response for testing (remove this in production)
  res.status(200).json({ message: "OTP sent", generated_otp: otp });
}

const placeorder = (req, res) => {
  console.log("hii")
  const { mobile, otp } = req.body.cloth_details;
}

module.exports = {
  submitform,
  placeorder,
  fetch_delivery_details,
  delivery_done,
  unverified_delivery,
  update_payment_status
}
