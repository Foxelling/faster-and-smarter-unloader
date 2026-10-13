"use strict";

// Increase unloader transfer speed to 180 items per second (speed = 60 / rate)
Blocks.unloader.speed = 60 / 180;

// Cached list of all registered game items
let fastItems = [];

function refreshFastItems() {
    fastItems = [];
    let seq = Vars.content.items();
    for (let i = 0; i < seq.size; i++) {
        fastItems.push(seq.get(i));
    }
}

// Populate the items list when client loads
Events.on(EventType.ClientLoadEvent, cons(e => {
    refreshFastItems();
}));

// Refresh items cache and wipe state on world load
Events.on(EventType.WorldLoadEvent, cons(e => {
    if (fastItems.length === 0) {
        refreshFastItems();
    }
    buildingData.clear();
    blockOutputCache.clear();
}));

// Clean up state caches on game reset
Events.on(EventType.ResetEvent, cons(e => {
    buildingData.clear();
    blockOutputCache.clear();
}));

/**
 * Cache block output item IDs to prevent passing finished products between identical factories.
 * Key: block.id -> Value: Set of output item IDs.
 */
const blockOutputCache = new Map();

function getBlockOutputs(block) {
    let cached = blockOutputCache.get(block.id);
    if (cached) return cached;

    let outputs = new Set();

    if (block instanceof GenericCrafter) {
        if (block.outputItems != null) {
            for (let i = 0; i < block.outputItems.length; i++) {
                outputs.add(block.outputItems[i].item.id);
            }
        } else if (block.outputItem != null) {
            outputs.add(block.outputItem.item.id);
        }
    } else if (block instanceof Separator) {
        if (block.results != null) {
            for (let i = 0; i < block.results.length; i++) {
                outputs.add(block.results[i].item.id);
            }
        }
    }

    blockOutputCache.set(block.id, outputs);
    return outputs;
}

/**
 * Storage for unloader runtime states indexed by building.id.
 * Avoids attaching custom JS properties directly to Java building instances (Rhino bridge safety).
 */
const buildingData = new Map();

function getData(building) {
    let data = buildingData.get(building.id);
    if (!data) {
        data = {
            rot: 0,
            pairs: null
        };
        buildingData.set(building.id, data);
    }
    return data;
}

/**
 * Pre-analyzes and caches valid neighbor transfer pairs (source -> target).
 * Executed only during onProximityUpdate rather than on every tick in updateTile.
 */
function updateProximityPairs(unloaderBuild, data) {
    let pSize = unloaderBuild.proximity.size;
    if (pSize < 2) {
        data.pairs = [];
        return;
    }

    let pairs = [];
    let team = unloaderBuild.team;

    for (let i = 0; i < pSize; i++) {
        let source = unloaderBuild.proximity.get(i);
        if (source == null || !source.interactable(team) || !source.block.unloadable || source.items == null) {
            continue;
        }

        let sourceIsStorage = source.block instanceof StorageBlock;
        let sourceIsTransport = source.block.group === BlockGroup.transportation;

        for (let j = 0; j < pSize; j++) {
            if (i === j) continue;
            let target = unloaderBuild.proximity.get(j);
            if (target == null || !target.interactable(team)) continue;

            // Never dump into core blocks
            if (target.block instanceof CoreBlock) continue;

            let targetIsStorage = target.block instanceof StorageBlock;
            // Prevent storage-to-storage and transport-to-storage loops
            if (sourceIsStorage && targetIsStorage) continue;
            if (sourceIsTransport && targetIsStorage) continue;

            // Check if both blocks are identical production facilities (e.g., chained unit factories)
            let isSameFactory = (source.block === target.block)
                && !sourceIsStorage
                && !sourceIsTransport
                && !(source.block instanceof BaseTurret)
                && !(source.block instanceof MassDriver)
                && !(source.block instanceof Incinerator)
                && !(source.block instanceof ItemIncinerator);

            let outputIds = isSameFactory ? getBlockOutputs(source.block) : null;

            pairs.push({
                source: source,
                target: target,
                isSameFactory: isSameFactory,
                outputIds: outputIds
            });
        }
    }

    data.pairs = pairs;
}

Blocks.unloader.buildType = () => extend(Unloader.UnloaderBuild, Blocks.unloader, {
    onProximityUpdate() {
        this.super$onProximityUpdate();
        let data = getData(this);
        updateProximityPairs(this, data);
    },

    onProximityRemoved() {
        this.super$onProximityRemoved();
        buildingData.delete(this.id);
    },

    onDestroyed() {
        this.super$onDestroyed();
        buildingData.delete(this.id);
    },

    updateTile() {
        let data = getData(this);

        if (data.pairs == null) {
            updateProximityPairs(this, data);
        }

        let pairs = data.pairs;
        let numPairs = pairs.length;

        // Exit immediately if there are no valid source-target pairs
        if (numPairs === 0) {
            this.unloadTimer = 0;
            return;
        }

        let speed = this.block.speed;
        this.unloadTimer += this.delta();

        if (this.unloadTimer < speed) {
            return;
        }

        let filter = this.sortItem;
        let numItems = fastItems.length;
        let rot = data.rot;

        while (this.unloadTimer >= speed) {
            let transferred = false;
            rot = (rot + 1) % numPairs;

            if (filter != null) {
                // Mode 1: Sorter filter is explicitly set
                for (let p = 0; p < numPairs; p++) {
                    let pair = pairs[(p + rot) % numPairs];
                    let source = pair.source;

                    if (source.items == null || source.items.total() === 0) continue;

                    let sourceCount = source.items.get(filter);
                    if (sourceCount <= 0) continue;

                    let canTransfer = false;

                    if (pair.isSameFactory) {
                        // Identical factory chain: do not transfer finished products; enforce gradient (diff >= 2)
                        if (!pair.outputIds.has(filter.id)) {
                            let targetCount = pair.target.items != null ? pair.target.items.get(filter) : 0;
                            if (sourceCount - targetCount >= 2) {
                                canTransfer = true;
                            }
                        }
                    } else {
                        // Standard rule: do not unload raw materials consumed by this factory
                        if (!source.block.consumesItem(filter)) {
                            canTransfer = true;
                        }
                    }

                    if (canTransfer) {
                        let target = pair.target;
                        if (target.acceptItem(this, filter)) {
                            source.removeStack(filter, 1);
                            target.handleItem(this, filter);
                            transferred = true;
                            rot = (p + rot) % numPairs;
                            break;
                        }
                    }
                }
            } else {
                // Mode 2: Unfiltered mode (transfers any eligible item)
                searchLoopNoFilter:
                for (let p = 0; p < numPairs; p++) {
                    let pair = pairs[(p + rot) % numPairs];
                    let source = pair.source;

                    if (source.items == null || source.items.total() === 0) continue;

                    for (let k = 0; k < numItems; k++) {
                        let item = fastItems[k];
                        let sourceCount = source.items.get(item);

                        if (sourceCount <= 0) continue;

                        let canTransfer = false;

                        if (pair.isSameFactory) {
                            // Identical factory chain: do not transfer finished products; enforce gradient (diff >= 2)
                            if (!pair.outputIds.has(item.id)) {
                                let targetCount = pair.target.items != null ? pair.target.items.get(item) : 0;
                                if (sourceCount - targetCount >= 2) {
                                    canTransfer = true;
                                }
                            }
                        } else {
                            // Standard rule: do not unload raw materials consumed by this factory
                            if (!source.block.consumesItem(item)) {
                                canTransfer = true;
                            }
                        }

                        if (canTransfer) {
                            let target = pair.target;
                            if (target.acceptItem(this, item)) {
                                source.removeStack(item, 1);
                                target.handleItem(this, item);
                                transferred = true;
                                rot = (p + rot) % numPairs;
                                break searchLoopNoFilter;
                            }
                        }
                    }
                }
            }

            if (transferred) {
                this.unloadTimer -= speed;
            } else {
                // Cap accumulated timer when stalled to avoid lagging on saturated lines
                this.unloadTimer = Math.min(this.unloadTimer, speed);
                break;
            }
        }

        data.rot = rot;
    }
});
