/**
 * Command registry for the command palette.
 *
 * This module provides a central registry of all commands available in the TUI.
 * Commands are dynamically generated based on application state and can be
 * filtered by availability.
 */

import type { Command } from '../types/commands.js';

/**
 * Command registry state.
 */
class CommandRegistry {
  private commands: Map<string, Command> = new Map();

  /**
   * Register a command in the registry.
   *
   * @param command - Command to register
   */
  register(command: Command): void {
    this.commands.set(command.id, command);
  }

  /**
   * Unregister a command from the registry.
   *
   * @param commandId - ID of command to unregister
   */
  unregister(commandId: string): void {
    this.commands.delete(commandId);
  }

  /**
   * Get all registered commands.
   *
   * @returns Array of all commands
   */
  getAll(): Command[] {
    return Array.from(this.commands.values());
  }

  /**
   * Get all available commands (where `available()` returns true).
   *
   * @returns Array of available commands
   */
  getAvailable(): Command[] {
    return this.getAll().filter((cmd) => cmd.available());
  }

  /**
   * Get a command by ID.
   *
   * @param commandId - ID of command to retrieve
   * @returns Command if found, undefined otherwise
   */
  get(commandId: string): Command | undefined {
    return this.commands.get(commandId);
  }

  /**
   * Clear all commands from the registry.
   */
  clear(): void {
    this.commands.clear();
  }
}

/**
 * Singleton command registry instance.
 */
export const commandRegistry = new CommandRegistry();
