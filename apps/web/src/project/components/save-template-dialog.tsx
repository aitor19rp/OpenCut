import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";

export function SaveTemplateDialog({
	isOpen,
	onOpenChange,
	onConfirm,
	defaultName,
}: {
	isOpen: boolean;
	onOpenChange: (open: boolean) => void;
	onConfirm: (name: string) => void;
	defaultName: string;
}) {
	const [name, setName] = useState(defaultName);

	const handleOpenChange = (open: boolean) => {
		if (open) setName(defaultName);
		onOpenChange(open);
	};

	return (
		<Dialog open={isOpen} onOpenChange={handleOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Guardar como plantilla</DialogTitle>
				</DialogHeader>
				<DialogBody className="flex flex-col gap-3">
					<Label>Nombre de la plantilla</Label>
					<Input
						value={name}
						onChange={(event) => setName(event.target.value)}
						onKeyDown={(event) => {
							if (event.key === "Enter" && name.trim()) onConfirm(name.trim());
						}}
					/>
					<p className="text-muted-foreground text-xs">
						Se guardan los textos, pegatinas, efectos y ajustes (tamaño, fps,
						fondo). Los vídeos, imágenes y audios no: los pones tú cada vez.
					</p>
				</DialogBody>
				<DialogFooter>
					<Button variant="outline" onClick={() => onOpenChange(false)}>
						Cancelar
					</Button>
					<Button disabled={!name.trim()} onClick={() => onConfirm(name.trim())}>
						Guardar
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
