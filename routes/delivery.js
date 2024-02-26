
const express = require('express')
const router = express.Router();
const deliveryControllers =  require('../controllers/delivery')


// router.post('/submitform', deliveryControllers.submitform);
// router.get("/welcome",deliveryControllers.welcome)

router.post('/placeorder', deliveryControllers.placeorder);

router.post('/fetch_delivery_details',deliveryControllers.fetch_delivery_details);
router.post('/delivery_done', deliveryControllers.delivery_done)
router.get('/unverified_delivery', deliveryControllers.unverified_delivery)
router.post('/update_payment_status', deliveryControllers.update_payment_status);
router.get('/customer_pending_payment', deliveryControllers.customer_pending_payment);
router.get('/delete_database', deliveryControllers.delete_database);


module.exports = router;