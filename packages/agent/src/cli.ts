#!/usr/bin/env node

import { Command } from 'commander';
import { OnPremiseAgent } from './index';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import dotenv from 'dotenv';

dotenv.config();

const program = new Command();

const CONFIG_DIR = join(homedir(), '.pacore');
const CONFIG_FILE = join(CONFIG_DIR, 'agent-config.json');

/**
 * CLI for managing the on-premise agent
 */
program
  .name('pacore-agent')
  .description('PA Core on-premise agent')
  .version('1.0.0');

program
  .command('init')
  .description('Initialize agent configuration')
  .requiredOption('--token <token>', 'Agent authentication token')
  .option('--cloud-url <url>', 'Cloud service URL', 'https://api.pacore.io')
  .option('--agent-id <id>', 'Agent ID (generated if not provided)')
  .option('--ollama-url <url>', 'Ollama endpoint URL', 'http://localhost:11434')
  .option('--ollama-model <model>', 'Default Ollama model', 'llama2')
  .action((options) => {
    const config = {
      agentId: options.agentId || `agent-${Date.now()}`,
      agentToken: options.token,
      cloudUrl: options.cloudUrl,
      localLLMs: {
        ollama: {
          baseUrl: options.ollamaUrl,
          defaultModel: options.ollamaModel,
        },
      },
      enabledTools: [],
      fileAccess: {
        enabled: false,
      },
    };

    // Create config directory if it doesn't exist
    const fs = require('fs');
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }

    // Save configuration
    writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));

    console.log('Agent configuration initialized at:', CONFIG_FILE);
    console.log('Agent ID:', config.agentId);
    console.log('\nYou can now start the agent with: pacore-agent start');
  });

program
  .command('start')
  .description('Start the on-premise agent')
  .option('--config <path>', 'Path to config file', CONFIG_FILE)
  .action(async (options) => {
    if (!existsSync(options.config)) {
      console.error('Configuration file not found. Run "pacore-agent init" first.');
      process.exit(1);
    }

    const config = JSON.parse(readFileSync(options.config, 'utf-8'));

    console.log('Starting PA Core agent...');
    console.log('Agent ID:', config.agentId);
    console.log('Cloud URL:', config.cloudUrl);

    const agent = new OnPremiseAgent(config);

    agent.on('connected', () => {
      console.log('✓ Agent connected successfully');
    });

    agent.on('disconnected', () => {
      console.log('✗ Agent disconnected');
    });

    agent.on('error', (error) => {
      console.error('Agent error:', error.message);
    });

    await agent.connect();

    // Graceful shutdown
    process.on('SIGTERM', () => {
      console.log('Shutting down agent...');
      agent.disconnect();
      process.exit(0);
    });

    process.on('SIGINT', () => {
      console.log('Shutting down agent...');
      agent.disconnect();
      process.exit(0);
    });
  });

program
  .command('status')
  .description('Check agent status')
  .option('--config <path>', 'Path to config file', CONFIG_FILE)
  .action((options) => {
    if (!existsSync(options.config)) {
      console.error('Configuration file not found.');
      process.exit(1);
    }

    const config = JSON.parse(readFileSync(options.config, 'utf-8'));
    console.log('Agent configuration:');
    console.log(JSON.stringify(config, null, 2));
  });

program.parse(process.argv);
