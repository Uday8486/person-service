import { FastifyRequest, FastifyReply } from 'fastify';
import { PersonService } from '../services/person.service';
import { Person } from '../models/person';

export class PersonController {
  private readonly service: PersonService;

  constructor(service: PersonService) {
    this.service = service;
  }

  createPerson = async (req: FastifyRequest<{ Body: Person }>, reply: FastifyReply) => {
    try {
      const person = await this.service.createPerson(req.body);
      return reply.code(201).send(person);
    } catch (error: any) {
      req.log.error(error);
      return reply.code(500).send({ error: 'Internal Server Error' });
    }
  };
}
