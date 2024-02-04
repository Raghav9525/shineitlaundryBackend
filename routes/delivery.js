
const express = require('express')
const router = express.Router();
const deliveryControllers =  require('../controllers/delivery')


router.post('/submitform', deliveryControllers.submitform);

router.post('/placeorder', deliveryControllers.placeorder);

router.post('/fetch_delivery_details',deliveryControllers.fetch_delivery_details);
router.post('/delivery_done', deliveryControllers.delivery_done)
router.post('/unverified_delivery', deliveryControllers.unverified_delivery)
router.post('/update_payment_status', deliveryControllers.update_payment_status);

module.exports = router;