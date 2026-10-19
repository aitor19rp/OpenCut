"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { getDeepLApiKey, setDeepLApiKey } from "@/text/deepl";

export function DeepLSettingsDialog({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const [apiKey, setApiKey] = useState(() => getDeepLApiKey() ?? "");
	const hasSavedKey = Boolean(getDeepLApiKey());

	const save = () => {
		setDeepLApiKey({ apiKey: apiKey.trim() || null });
		onOpenChange(false);
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Configurar DeepL</DialogTitle>
					<DialogDescription>
						Pega tu clave de API de DeepL (en deepl.com, Cuenta → API). Se guarda
						solo en este equipo. Con clave, se traduce con DeepL; sin clave, con
						el traductor integrado.
					</DialogDescription>
				</DialogHeader>
				<DialogBody>
					<Input
						type="password"
						autoComplete="off"
						placeholder="Clave de API de DeepL"
						value={apiKey}
						onChange={(event) => setApiKey(event.target.value)}
					/>
				</DialogBody>
				<DialogFooter>
					{hasSavedKey && (
						<Button
							variant="outline"
							onClick={() => {
								setDeepLApiKey({ apiKey: null });
								setApiKey("");
								onOpenChange(false);
							}}
						>
							Quitar clave
						</Button>
					)}
					<Button onClick={save}>Guardar</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
