/*
 * Copyright (C) 2017, 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as chai from 'chai';
import * as lsp from 'vscode-languageserver';
import * as lspTypeHierarchy from './type-hierarchy.lsp.proposal';
import { LspServer } from './lsp-server';
import { uri, createServer, position, lastPosition } from './test-utils';

const assert = chai.assert;

let diagnostics: Array<lsp.PublishDiagnosticsParams | undefined>;

let server: LspServer;

before(async () => {
    server = await createServer({
        rootUri: null,
        publishDiagnostics: args => diagnostics.push(args)
    })
});
beforeEach(() => {
    diagnostics = [];
    server.closeAll();
})

describe('typeHierarchy', () => {
    function asString(item: lspTypeHierarchy.TypeHierarchyItem | null) {
        if (!item) {
            return '<not found>';
        }
        const symbolToString = (item: lspTypeHierarchy.TypeHierarchyItem) =>
            `${item.name} (location: ${item.uri.split('/').pop()}#${item.selectionRange.start.line})`;
        const out: string[] = [];
        out.push(symbolToString(item));
        if (item.parents) {
            out.push(`[supertypes]`);
            for (const parent of item.parents) {
                out.push('--|> ' + symbolToString(parent));
            }
        }
        if (item.children) {
            out.push(`[subtypes]`);
            for (const child of item.children) {
                out.push('<|-- ' + symbolToString(child));
            }
        }
        if (item.parents) {

        }
        return out.join('\n').trim();
    }
    const textDocument = {
        uri: uri('types.ts'),
        languageId: 'typescript',
        version: 1,
        text: `// comment on line 0
export interface SuperInterface {}
export interface SomeInterface {}
export interface Comparable extends SuperInterface {}
export class Bar implements Comparable {}
export class Foo extends Bar implements SomeInterface {}
export class Zoo extends Foo implements SuperInterface { /*
    ...
*/}`
    };

    function openDocuments() {
        server.didOpenTextDocument({ textDocument });
    }

    it('find target symbol', async () => {
        openDocuments();
        const item = await server.typeHierarchy(<lspTypeHierarchy.TypeHierarchyParams>{
            textDocument,
            position: lsp.Position.create(6, 15),
            direction: lspTypeHierarchy.TypeHierarchyDirection.Parents,
            resolve: 0
        });
        assert.equal(asString(item), `
Zoo (location: types.ts#6)`.trim());
    }).timeout(10000);

    it('supertypes: first level', async () => {
        openDocuments();
        const item = await server.typeHierarchy(<lspTypeHierarchy.TypeHierarchyParams>{
            textDocument,
            position: lsp.Position.create(6, 15),
            direction: lspTypeHierarchy.TypeHierarchyDirection.Parents,
            resolve: 0
        });
        assert.isTrue(item !== null, "precondition failed: first level");
        assert.isTrue(item!.parents === undefined, "precondition failed: unresolved item");

        const resolvedItem = await server.typeHierarchyResolve({
            item: item!,
            direction: lspTypeHierarchy.TypeHierarchyDirection.Parents,
            resolve: 1
        })
        assert.equal(asString(resolvedItem), `
Zoo (location: types.ts#6)
[supertypes]
--|> Foo (location: types.ts#5)
--|> SuperInterface (location: types.ts#1)`.trim());
    }).timeout(10000);

    it('supertypes: second level', async () => {
        openDocuments();
        const item = await server.typeHierarchy(<lspTypeHierarchy.TypeHierarchyParams>{
            textDocument,
            position: lsp.Position.create(6, 15),
            direction: lspTypeHierarchy.TypeHierarchyDirection.Parents,
            resolve: 1
        });
        assert.isTrue(item !== null, "precondition failed: first level");
        assert.isTrue(item!.parents !== undefined, "precondition failed: resolved item");

        const toBeResolved = item!.parents![0];
        const resolvedItem = await server.typeHierarchyResolve({
            item: toBeResolved,
            direction: lspTypeHierarchy.TypeHierarchyDirection.Parents,
            resolve: 1
        })
        assert.equal(asString(resolvedItem), `
Foo (location: types.ts#5)
[supertypes]
--|> Bar (location: types.ts#4)
--|> SomeInterface (location: types.ts#2)`.trim());
    }).timeout(10000);

    it('subtype: first level', async () => {
        openDocuments();
        const item = await server.typeHierarchy(<lspTypeHierarchy.TypeHierarchyParams>{
            textDocument,
            position: lsp.Position.create(1, 20),
            direction: lspTypeHierarchy.TypeHierarchyDirection.Children,
            resolve: 0
        });
        assert.isTrue(item !== null, "precondition failed: first level");
        assert.isTrue(item!.parents === undefined, "precondition failed: unresolved item");

        const resolvedItem = await server.typeHierarchyResolve({
            item: item!,
            direction: lspTypeHierarchy.TypeHierarchyDirection.Children,
            resolve: 1
        })
        assert.equal(asString(resolvedItem), `
SuperInterface (location: types.ts#1)
[subtypes]
<|-- Comparable (location: types.ts#3)
<|-- Zoo (location: types.ts#6)`.trim());
    }).timeout(10000);

    it('subtype: second level', async () => {
        openDocuments();
        const item = await server.typeHierarchy(<lspTypeHierarchy.TypeHierarchyParams>{
            textDocument,
            position: lsp.Position.create(1, 20),
            direction: lspTypeHierarchy.TypeHierarchyDirection.Children,
            resolve: 1
        });
        assert.isTrue(item !== null, "precondition failed: first level");
        assert.isTrue(item!.children !== undefined, "precondition failed: resolved item");

        const toBeResolved = item!.children![0];
        const resolvedItem = await server.typeHierarchyResolve({
            item: toBeResolved,
            direction: lspTypeHierarchy.TypeHierarchyDirection.Children,
            resolve: 1
        })
        assert.equal(asString(resolvedItem), `
Comparable (location: types.ts#3)
[subtypes]
<|-- Bar (location: types.ts#4)`.trim());
    }).timeout(10000);

    it('supertypes and subtypes combined', async () => {
        openDocuments();
        const item = await server.typeHierarchy(<lspTypeHierarchy.TypeHierarchyParams>{
            textDocument,
            position: lsp.Position.create(5, 16),
            direction: lspTypeHierarchy.TypeHierarchyDirection.Both,
            resolve: 1
        });
        assert.isTrue(item !== null, "precondition failed: first level");

        assert.equal(asString(item), `
Foo (location: types.ts#5)
[supertypes]
--|> Bar (location: types.ts#4)
--|> SomeInterface (location: types.ts#2)
[subtypes]
<|-- Zoo (location: types.ts#6)`.trim());
    }).timeout(10000);
});
