export const ZENDESK_TOOLS = [
  {
    name: 'zendesk__create_ticket',
    description: 'Create a Zendesk support ticket. Zendesk will email the customer from the ticket automatically.',
    inputSchema: {
      type: 'object',
      properties: {
        customer_email: { type: 'string', description: 'Customer email address' },
        customer_name:  { type: 'string', description: 'Customer display name' },
        subject:        { type: 'string', description: 'Ticket subject (becomes email subject)' },
        message:        { type: 'string', description: 'Ticket body HTML (becomes email body)' },
        priority:       { type: 'string', enum: ['low', 'normal', 'high', 'urgent'], description: 'Ticket priority' },
        tags:           { type: 'array', items: { type: 'string' }, description: 'Tags to apply to ticket' },
      },
      required: ['customer_email', 'subject', 'message'],
    },
  },
];
