import { Router } from 'express';
import { getQuiz, submitQuiz } from '../controllers/quiz.controller';
import { requireAuth } from '../middleware/auth';

export const quizRouter = Router();

quizRouter.get('/quiz', requireAuth, getQuiz);
quizRouter.post('/quiz', requireAuth, submitQuiz);
