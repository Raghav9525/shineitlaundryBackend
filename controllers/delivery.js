const axios = require('axios');
require('dotenv').config();
const cors = require('cors')
const mysql = require('mysql2');
const util = require('util');


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

// function for payment verification table
const unverified_delivery = (req, res) => {

  const sql = "SELECT dd.db_name, d.delivery_id, d.cust_mobile, d.db_mobile, d.payment_mode,d.bill, d.paid_amount FROM delivery d JOIN db_details dd ON d.db_mobile = dd.db_mobile WHERE d.payment_verify = '0'";
  pool.getConnection((error, connection) => {
    connection.query(sql, (err, result) => {
      if (err) {
        connection.release();
        return res.status(500).json({ message: 'Internal server error' });
      }

      if (result.length > 0) {
        return res.json(result);
      }
      connection.release(); // Release the database connection
    });
  });
}



// Corrected and separated delete functions
function deleteRowByAccountId(connection, account_id) {
  return new Promise((resolve, reject) => {
    const sql = "DELETE FROM delivery_account WHERE account_id = ?";
    connection.query(sql, [account_id], (err, result) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}


// Corrected payPendingPayment function
function payPendingPayment(connection, account_id, newRemainingBill) {
  return new Promise((resolve, reject) => {
    const sql = "UPDATE delivery_account SET remaining_bill = ? WHERE account_id = ?";
    connection.query(sql, [newRemainingBill, account_id], (err, result) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}


function deleteRowByDeliveryId(connection, delivery_id) {
  return new Promise((resolve, reject) => {
    const sql = "DELETE FROM delivery_account WHERE delivery_id = ?";
    connection.query(sql, [delivery_id], (err, result) => {
      if (err) {
        console.error("Error in deleting row by delivery_id:", err);
        reject(err);
      } else {
        console.log(delivery_id + " row deleted");
        resolve();
      }
    });
  });
}


//handle pending payment options by updating 'payment_verify' = 1 in delivery table
async function paymentVerify(pool, delivery_id) {
  return new Promise((resolve, reject) => {
    const sql = "UPDATE delivery SET payment_verify = '1' WHERE delivery_id = ?";
    pool.getConnection((error, connection) => {
      if (error) {
        reject(error);
      } else {
        connection.query(sql, [delivery_id], (err, result) => {
          connection.release();
          if (err) {
            reject(err);
          } else {
            resolve(true);
          }
        });
      }
    });
  });
}


// Logic for handling payments and remaining bills
async function updateRemainingBill(pool, delivery_id, cust_mobile, paid_amount, bill) {
  return new Promise((resolve, reject) => {
    pool.getConnection((error, connection) => {
      if (error) {
        reject(error); // Reject the promise with the error
      } else {

        // Logic for handling payments and remaining bills
        if (paid_amount >= bill) {
          let extra_amount = paid_amount - bill;
          deleteRowByDeliveryId(connection, delivery_id).then(() => {
            const sql1 = "SELECT account_id, remaining_bill FROM delivery_account WHERE cust_mobile = ?";
            connection.query(sql1, [cust_mobile], (err, delivery_account_result) => {
              if (err) {
                connection.release();
                reject(err);
              } else {
                // Assume deleteRowByAccountId and payPendingPayment are now promise-based too
                let processRemainingAccounts = async (index) => {
                  if (index < delivery_account_result.length && extra_amount > 0) {
                    let { account_id, remaining_bill } = delivery_account_result[index];
                    if (extra_amount >= remaining_bill) {
                      try {
                        await deleteRowByAccountId(connection, account_id);
                        extra_amount -= remaining_bill;
                        await processRemainingAccounts(index + 1);
                      } catch (error) {
                        connection.release();
                        reject(error);
                      }
                    } else {
                      let newRemainingBill = remaining_bill - extra_amount;
                      try {
                        await payPendingPayment(connection, account_id, newRemainingBill);
                        connection.release();
                        resolve("Extra payment processed successfully");
                      } catch (payError) {
                        connection.release();
                        reject(payError);
                      }
                    }
                  } else {
                    connection.release();
                    resolve("Extra payment processed successfully");
                  }
                };

                // Start processing delivery accounts
                processRemainingAccounts(0);
              }
            });
          }).catch(deleteError => {
            connection.release();
            reject(deleteError);
          });
        } else {
          let newRemainingBill = bill - paid_amount;
          const sql2 = "UPDATE delivery_account SET remaining_bill = ? WHERE delivery_id = ?";
          connection.query(sql2, [newRemainingBill, delivery_id], (err) => {
            if (err) {
              connection.release();
              reject(err);
            } else {
              connection.release();
              resolve("Remaining bill updated successfully");
            }
          });
        }
      }
    });
  });
}


// Corrected update_payment_status function
const update_payment_status = async (req, res) => {
  try {
    const { delivery_id, cust_mobile, db_mobile, payment_mode, bill, paid_amount } = req.body.paymentDetails;

    const paymentVerified = await paymentVerify(pool, delivery_id);
    if (paymentVerified) {
      // Update the remaining bill
      await updateRemainingBill(pool, delivery_id, cust_mobile, paid_amount, bill, (err, message) => {
        if (err) {
          console.error('Failed to update remaining bill:', err);
          return res.status(500).json({ message: 'Error updating remaining bill' });
        }
        // If everything is successful, send a success response
        res.status(200).json({ message: 'Payment verified and remaining bill updated successfully' });
      });
    } else {
      res.status(500).json({ message: 'Payment verification failed unexpectedly.' });
    }
  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ message: 'An error occurred' });
  }
};




const delivery_done = async (req, res) => {
  const { mobile, db_mobile, pay_method, bill, payable_amount } = req.body.cloth_details;

  const sql = 'INSERT INTO delivery (cust_mobile, db_mobile, payment_mode, bill, paid_amount, payment_verify, time) VALUES (?, ?, ?, ?, ?, "0", NOW())';

  try {
    pool.getConnection((err, connection) => {
      connection.query(sql, [mobile, db_mobile, pay_method, bill, payable_amount], async (err, result) => { // Making the callback function async
        const lastId = result.insertId;

        const sql1 = "INSERT INTO delivery_account (delivery_id, cust_mobile, db_mobile, remaining_bill) VALUES (?, ?, ?, ?)";

        connection.query(sql1, [lastId, mobile, db_mobile, bill], async (err, result1) => { // Making the callback function async

          const sql2 = "UPDATE orders SET delivery_status = '1' WHERE cust_mobile=? and bill=?";
          connection.query(sql2, [mobile, bill], async (err, result2) => { // Making the callback function async

            if (pay_method === 'pending') {
              //first verify payment then updateRemainingBill to normalize delivery boy account
              try {
                const paymentVerified = await paymentVerify(pool, lastId); // Using lastId instead of undefined delivery_id
                if (paymentVerified) {
                  await updateRemainingBill(pool, lastId, mobile, payable_amount, bill); // Using lastId instead of undefined delivery_id
                  // res.status(200).json({ message: 'Payment verified and remaining bill updated successfully' });
                } else {
                  res.status(500).json({ message: 'Payment verification failed unexpectedly.' });
                }
              } catch (error) {
                console.error("Error:", error);
                res.status(500).json({ message: 'An error occurred while processing the request.' });
              }
            }
            connection.release()
            return res.status(200).json({message:"Delivery Successful"})
          });
        });
      });
    });
  } catch (error) {
    res.status(500).json({ message: 'An error occurred while processing the request.' });
  }
};




const fetch_delivery_details = (req, res) => {
  const delivery_details = req.body.delivery_details;
  const cust_mobile = delivery_details.mobile;

  const sqlCurrentBill = `SELECT bill FROM orders WHERE cust_mobile = ? AND delivery_status = '0'`;
  const sqlRemainingBills = `SELECT remaining_bill FROM delivery_account WHERE cust_mobile = ?`;

  pool.getConnection((err, connection) => {
    if (err) {
      connection.release();
      return res.status(500).json({ message: "Error connecting to the database" });
    }

    // Query to fetch the current bill
    connection.query(sqlCurrentBill, [cust_mobile], (error, currentBillResults) => {
      if (error) {
        connection.release();
        return res.status(500).json({ message: "Error fetching current bill" });
      }

      // Query to fetch all remaining bills
      connection.query(sqlRemainingBills, [cust_mobile], (error, remainingBillResults) => {
        connection.release(); // Release the connection after the second query

        if (error) {
          return res.status(500).json({ message: "Error fetching remaining bills" });
        }

        // Calculate the sum of remaining bills
        const totalRemainingBill = remainingBillResults.reduce((sum, row) => sum + row.remaining_bill, 0);

        // Sending response with current bill and total remaining bill
        return res.status(200).json({
          bill: currentBillResults.length > 0 ? currentBillResults[0].bill : 0,
          PreviousBill: totalRemainingBill
        });
      });
    });
  });
};



const welcome = (req, res) => {
  console.log("welcome route")
  res.send("Welcome to the delivery route");
}

const generateOtp = () => {
  return Math.floor(1000 + Math.random() * 9000); // Generate 4 digit OTP
};


const placeorder = (req, res) => {
  const { custMob, clothDetail } = req.body;
  let bill = 0;
  let pantPrice = 10;
  let shirtPrice = 15;

  // Calculate bill
  clothDetail.forEach(item => {
    let price = 0; // Correctly declare price here
    if (item.clothName == "pant") {
      price = pantPrice;
    } else if (item.clothName == 'shirt') {
      price = shirtPrice;
    } else {
      return; // Skip this item
    }

    const totalItemPrice = price * item.clothCount;
    bill += totalItemPrice;
  });

  // SQL to insert data in orders table
  const sql = 'INSERT INTO orders (cust_mobile, bill, delivery_status) VALUES (?, ?, 0)';

  pool.getConnection((error, con) => {
    if (error) {
      console.error("Error getting connection:", error);
      return res.status(500).json({ message: "Error getting database connection" });
    }

    // Start transaction
    con.beginTransaction(err => {
      if (err) {
        console.error("Error starting transaction:", err);
        con.release();
        return res.status(500).json({ message: "Failed to start transaction" });
      }

      // Insert into orders table
      con.query(sql, [custMob, bill], (err, result) => {
        if (err) {
          console.error("Error inserting order:", err);
          con.rollback(() => con.release());
          return res.status(500).json({ message: "Order not placed" });
        }

        const orderId = result.insertId; // Corrected variable name
        // Prepare batch insert for cloth_details
        const clothDetailsData = clothDetail.map(item => [orderId, item.clothName, item.clothCount]);

        const sql1 = 'INSERT INTO cloth_details (order_id, cloth_name, cloth_count) VALUES ?'; // Corrected SQL command

        // Insert cloth details
        con.query(sql1, [clothDetailsData], (err, result) => {
          if (err) {
            console.error("Error inserting cloth details:", err);
            con.rollback(() => con.release());
            return res.status(500).json({ message: "Failed to insert cloth details" });
          }

          // Commit transaction
          con.commit(err => {
            if (err) {
              console.error("Error committing transaction:", err);
              con.rollback(() => con.release());
              return res.status(500).json({ message: "Transaction failed" });
            }

            con.release(); // Correct place to release the connection
            res.status(200).json({ message: "Order placed successfully", bill: bill });
          });
        });
      });
    });
  });
}

const customer_pending_payment = (req, res) => {

  const sql = "select * from delivery_account";

  pool.getConnection((err, connection) => {
    if (err) {
      connection.release()
      return
    } else {
      connection.query(sql, (error, result) => {
        if (result.length > 0) {
          return res.json(result);
        }
        else {
          return res.json()
        }
      });
    }
    connection.release([]); // Release connection if no rows affected

  })
}


module.exports = {
  welcome,
  // submitform,
  placeorder,
  fetch_delivery_details,
  delivery_done,
  unverified_delivery,
  update_payment_status,
  customer_pending_payment
}
