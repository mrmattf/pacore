export const GORGIAS_TOOLS = [
  {
    name: 'gorgias__create_ticket',
    description: 'Create a Gorgias support ticket. Gorgias will email the customer from the ticket automatically.',
    inputSchema: {
      type: 'object',
      properties: {
        customer_email: { type: 'string', description: 'Customer email address' },
        customer_name:  { type: 'string', description: 'Customer display name' },
        subject:        { type: 'string', description: 'Ticket subject (becomes email subject)' },
        message:        { type: 'string', description: 'Ticket body HTML (becomes email body)' },
        priority:       { type: 'string', enum: ['low', 'normal', 'high'], description: 'Ticket priority' },
        tags:           { type: 'array', items: { type: 'string' }, description: 'Tags to apply to ticket' },
      },
      required: ['customer_email', 'subject', 'message'],
    },
  },
  {
    name: 'gorgias__add_message',
    description: 'Add a follow-up message to an existing Gorgias ticket.',
    inputSchema: {
      type: 'object',
      properties: {
        ticket_id: { type: 'string', description: 'Gorgias ticket ID' },
        message:   { type: 'string', description: 'Message body HTML' },
      },
      required: ['ticket_id', 'message'],
    },
  },
];
