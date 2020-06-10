import * as express from 'express';

const htmlRouter = express.Router();

htmlRouter.get('/', function(req, res) {
  res.render('index', { title: 'Express' });
});

export {
  htmlRouter
};
