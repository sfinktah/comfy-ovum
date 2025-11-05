/**
 * @module Actions API
 * File: actions.js
 * Project: comfy_mtb
 * Author: Mel Massadian
 * Copyright (c) 2023-2024 Mel Massadian
 */

import { api } from '/scripts/api.js'

export const runAction = async (name, ...args) => {
    const req = await api.fetchApi('/mtb/actions', {
        method: 'POST',
        body: JSON.stringify({
            name,
            args,
        }),
    })

    const res = await req.json()
    return res.result
}

export const getServerInfo = async () => {
    const res = await api.fetchApi('/mtb/server-info')
    return await res.json()
}

export const setServerInfo = async (opts) => {
    await api.fetchApi('/mtb/server-info', {
        method: 'POST',
        body: JSON.stringify(opts),
    })
}
