/**
 * @module Base utilities
 * File: base.js
 * Project: comfy_mtb
 * Author: Mel Massadian
 * Copyright (c) 2023-2024 Mel Massadian
 */

// - crude uuid
export function makeUUID() {
    let dt = new Date().getTime()
    const uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = ((dt + Math.random() * 16) % 16) | 0
        dt = Math.floor(dt / 16)
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
    })
    return uuid
}

//- local storage manager
export class LocalStorageManager {
    constructor(namespace) {
        this.namespace = namespace
    }

    _namespacedKey(key) {
        return `${this.namespace}:${key}`
    }

    set(key, value) {
        const serializedValue = JSON.stringify(value)
        localStorage.setItem(this._namespacedKey(key), serializedValue)
    }

    get(key, default_val = null) {
        const value = localStorage.getItem(this._namespacedKey(key))
        return value ? JSON.parse(value) : default_val
    }

    remove(key) {
        localStorage.removeItem(this._namespacedKey(key))
    }

    clear() {
        for (const key of Object.keys(localStorage).filter((k) =>
            k.startsWith(`${this.namespace}:`),
        )) {
            localStorage.removeItem(key)
        }
    }
}

// - log utilities

function createLogger(emoji, color, consoleMethod = 'log') {
    return (message, ...args) => {
        if (window.MTB?.DEBUG) {
            console[consoleMethod](
                `%c${emoji} ${message}`,
                `color: ${color};`,
                ...args,
            )
        }
    }
}

export const infoLogger = createLogger('ℹ️', 'yellow')
export const warnLogger = createLogger('⚠️', 'orange', 'warn')
export const errorLogger = createLogger('🔥', 'red', 'error')
export const successLogger = createLogger('✅', 'green')

export const log = (...args) => {
    if (window.MTB?.DEBUG) {
        console.debug(...args)
    }
}

/**
 * Deep merge two objects.
 * @param {Object} target - The target object to merge into.
 * @param {...Object} sources - The source objects to merge from.
 * @returns {Object} - The merged object.
 */
export function deepMerge(target, ...sources) {
    if (!sources.length) return target
    const source = sources.shift()

    for (const key in source) {
        if (source[key] instanceof Object) {
            if (!target[key]) Object.assign(target, { [key]: {} })
            deepMerge(target[key], source[key])
        } else {
            Object.assign(target, { [key]: source[key] })
        }
    }

    return deepMerge(target, ...sources)
}
