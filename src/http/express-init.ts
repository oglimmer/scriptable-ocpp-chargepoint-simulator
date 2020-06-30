import Debug from 'debug';
import * as express from 'express';
import * as path from 'path';
import * as cookieParser from 'cookie-parser';
import * as logger from 'morgan';

import {htmlRouter} from './routes/html';
import {cpRouter} from './routes/cp';
import {adminRouter} from './routes/admin';

const debug = Debug('ocpp-chargepoint-simulator:express:init');

const expressInit = express();

// view engine setup
expressInit.set('views', path.join(__dirname, '../../..', 'views'));
expressInit.set('view engine', 'ejs');

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
expressInit.use(logger('combined', { stream: { write: msg => debug(msg.trimEnd()) } }));
expressInit.use(express.json());
expressInit.use(express.urlencoded({extended: false}));
expressInit.use(express.raw({type: "application/javascript"}));
expressInit.use(cookieParser());
expressInit.use(express.static(path.join(__dirname, '../../..', 'public')));

expressInit.use('/', htmlRouter);
expressInit.use('/cp', cpRouter);
expressInit.use('/admin', adminRouter);

// catch 404 and forward to error handler
expressInit.use((req, res) => {
  // next(createError(404));
  res.status(404);
});

// error handler
// eslint-disable-next-line @typescript-eslint/no-explicit-any
expressInit.use((err: any, req: express.Request, res: express.Response) => {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

export {
  expressInit
};
