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
  private readonly commands = new Map<string, Command>();

  /**
   * Register a command in the registry.
   *
   * @param command - Command to register
   */
  public register(command: Command): void {
    this.commands.set(command.id, command);
  }

  /**
   * Unregister a command from the registry.
   *
   * @param commandId - ID of command to unregister
   */
  public unregister(commandId: string): void {
    this.commands.delete(commandId);
  }

  /**
   * Get all registered commands.
   *
   * @returns Array of all commands
   */
  public getAll(): Command[] {
    return Array.from(this.commands.values());
  }

  /**
   * Get all available commands (where `available()` returns true).
   *
   * @returns Array of available commands
   */
  public getAvailable(): Command[] {
    return this.getAll().filter((cmd) => cmd.available());
  }

  /**
   * Get a command by ID.
   *
   * @param commandId - ID of command to retrieve
   * @returns Command if found, undefined otherwise
   */
  public get(commandId: string): Command | undefined {
    return this.commands.get(commandId);
  }

  /**
   * Clear all commands from the registry.
   */
  public clear(): void {
    this.commands.clear();
  }
}

/**
 * Singleton command registry instance.
 */
export const commandRegistry = new CommandRegistry();
